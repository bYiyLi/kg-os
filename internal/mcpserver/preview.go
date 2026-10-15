package mcpserver

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

const previewPageSize = 100

type PreviewInput struct {
	Offset       int    `json:"offset,omitempty" jsonschema:"Zero-based line offset in the complete Markdown view; default 0."`
	Limit        *int   `json:"limit,omitempty" jsonschema:"Lines to return, 100 through 500; default 300. This limits the returned window, not the full view generation."`
	ViewRevision string `json:"viewRevision,omitempty" jsonschema:"Revision from a previous preview call to read the same frozen view; omit to generate a new view."`
}
type PreviewOutput struct {
	TotalLines   int    `json:"totalLines"`
	Offset       int    `json:"offset"`
	LineCount    int    `json:"lineCount"`
	ViewRevision string `json:"viewRevision"`
	Preview      string `json:"preview"`
}
type previewCacheEntry struct {
	lines     []string
	expires   time.Time
	principal string
}
type previewCache struct {
	mu      sync.Mutex
	entries map[string]previewCacheEntry
	order   []string
}

func (c *previewCache) prune(now time.Time) {
	active := c.order[:0]
	for _, id := range c.order {
		entry, ok := c.entries[id]
		if !ok {
			continue
		}
		if !entry.expires.After(now) {
			delete(c.entries, id)
			continue
		}
		active = append(active, id)
	}
	c.order = active
}

func previewString(v *string) string {
	if v == nil {
		return "—"
	}
	return *v
}
func summaryFromMessage(message *string) string {
	if message == nil {
		return "无规范简介"
	}
	lines := strings.Split(strings.ReplaceAll(*message, "\r\n", "\n"), "\n")
	begin := -1
	for idx, line := range lines {
		if line == "## 简介" && begin == -1 {
			begin = idx
		}
		if line == "## 改动" && begin >= 0 {
			for _, candidate := range lines[begin+1 : idx] {
				if strings.TrimSpace(candidate) != "" {
					return candidate
				}
			}
			break
		}
	}
	return "无规范简介"
}

type previewDefinition struct {
	summary kernel.Summary
	body    string
	value   json.RawMessage
}
type previewDomain struct {
	summary kernel.Summary
	members []kernel.Summary
	body    string
}
type branchSnapshot struct {
	name, head  string
	commit      kernel.EvolutionGetResult
	domains     []previewDomain
	definitions []previewDefinition
}

type previewBuilder struct {
	kernel   *kernel.Service
	maxItems int
	// Shared across all Branch snapshots: never accumulate more authoritative
	// canonical text/JSON than one bounded Preview document can represent.
	remainingBytes *int
}

// paginate reads the complete pinned Ontology scope. Partial pagination must
// fail rather than returning an incomplete authoritative Markdown document.
func (b previewBuilder) paginate(ctx context.Context, state, scope string) ([]kernel.Summary, error) {
	visited := make(map[string]bool)
	cursor := ""
	items := make([]kernel.Summary, 0)
	for {
		request := kernel.OntologyReadRequest{At: state, Limit: previewPageSize, Cursor: cursor}
		if scope != "" {
			request.Refs = []string{scope}
		}
		page, err := b.kernel.ReadOntology(ctx, request)
		if err != nil {
			return nil, err
		}
		if page.State != state || len(page.Results) != 1 {
			return nil, fmt.Errorf("RESOURCE_ERROR: pinned Ontology scope changed")
		}
		current := page.Results[0]
		if scope != "" && current.Ref != scope {
			return nil, fmt.Errorf("RESOURCE_ERROR: unexpected Ontology scope")
		}
		if current.Total < 0 || len(items)+len(current.Items) > b.maxItems {
			return nil, fmt.Errorf("RESOURCE_ERROR: Ontology exceeds view budget")
		}
		items = append(items, current.Items...)
		if current.Cursor == "" {
			if len(items) != current.Total {
				return nil, fmt.Errorf("RESOURCE_ERROR: incomplete Ontology pagination")
			}
			return items, nil
		}
		if len(current.Items) == 0 || visited[current.Cursor] {
			return nil, fmt.Errorf("RESOURCE_ERROR: Ontology pagination did not make progress")
		}
		visited[current.Cursor] = true
		cursor = current.Cursor
	}
}
func registerSummary(store map[string]kernel.Summary, item kernel.Summary, maxItems int) (bool, error) {
	if before, exists := store[item.Ref]; exists {
		if before.Kind != item.Kind || before.Name != item.Name {
			return false, fmt.Errorf("RESOURCE_ERROR: inconsistent Ontology identity")
		}
		return false, nil
	}
	if len(store) >= maxItems {
		return false, fmt.Errorf("RESOURCE_ERROR: Ontology exceeds item budget")
	}
	store[item.Ref] = item
	return true, nil
}
func (b previewBuilder) collect(ctx context.Context, head string, overview []kernel.Summary) (map[string]kernel.Summary, map[string]kernel.Summary, map[string][]kernel.Summary, error) {
	domains := make(map[string]kernel.Summary)
	definitions := make(map[string]kernel.Summary)
	members := make(map[string][]kernel.Summary)
	queue := make([]string, 0)
	classify := func(item kernel.Summary) error {
		switch item.Kind {
		case kernel.KindDomain:
			added, err := registerSummary(domains, item, b.maxItems)
			if err != nil {
				return err
			}
			if added {
				queue = append(queue, item.Ref)
			}
		case kernel.KindNodeDefinition, kernel.KindRelationshipDefinition:
			if _, err := registerSummary(definitions, item, b.maxItems); err != nil {
				return err
			}
		default:
			return fmt.Errorf("RESOURCE_ERROR: unexpected Ontology kind %s", item.Kind)
		}
		if len(domains)+len(definitions) > b.maxItems {
			return fmt.Errorf("RESOURCE_ERROR: Ontology exceeds item budget")
		}
		return nil
	}
	for _, summary := range overview {
		if err := classify(summary); err != nil {
			return nil, nil, nil, err
		}
	}
	for len(queue) > 0 {
		ref := queue[0]
		queue = queue[1:]
		children, err := b.paginate(ctx, head, ref)
		if err != nil {
			return nil, nil, nil, err
		}
		members[ref] = children
		for _, summary := range children {
			if err := classify(summary); err != nil {
				return nil, nil, nil, err
			}
		}
	}
	return domains, definitions, members, nil
}

func sortedRefs(items map[string]kernel.Summary) []string {
	refs := make([]string, 0, len(items))
	for ref := range items {
		refs = append(refs, ref)
	}
	sort.Strings(refs)
	return refs
}
func (b previewBuilder) loadBodies(ctx context.Context, state string, refs []string) (map[string]string, map[string]json.RawMessage, error) {
	texts := make(map[string]string, len(refs))
	values := make(map[string]json.RawMessage, len(refs))
	for i := 0; i < len(refs); i += previewPageSize {
		batch := refs[i:min(i+previewPageSize, len(refs))]
		r := kernel.ObjectReadRequest{At: state, Refs: batch}
		textResult, err := b.kernel.ReadObjectTexts(ctx, r)
		if err != nil {
			return nil, nil, err
		}
		valueResult, err := b.kernel.ReadObjects(ctx, r)
		if err != nil {
			return nil, nil, err
		}
		if textResult.State != state || valueResult.State != state || len(textResult.Results) != len(batch) || len(valueResult.Results) != len(batch) {
			return nil, nil, fmt.Errorf("RESOURCE_ERROR: pinned Ontology body read mismatch")
		}
		for _, item := range textResult.Results {
			if b.remainingBytes != nil {
				if len(item.Body) > *b.remainingBytes {
					return nil, nil, fmt.Errorf("RESOURCE_ERROR: Preview source exceeds document budget")
				}
				*b.remainingBytes -= len(item.Body)
			}
			texts[item.Ref] = item.Body
		}
		for _, item := range valueResult.Results {
			if b.remainingBytes != nil {
				if len(item.Value) > *b.remainingBytes {
					return nil, nil, fmt.Errorf("RESOURCE_ERROR: Preview source exceeds document budget")
				}
				*b.remainingBytes -= len(item.Value)
			}
			values[item.Ref] = item.Value
		}
	}
	for _, ref := range refs {
		if _, exists := texts[ref]; !exists {
			return nil, nil, fmt.Errorf("RESOURCE_ERROR: missing canonical Ontology text")
		}
		if _, exists := values[ref]; !exists {
			return nil, nil, fmt.Errorf("RESOURCE_ERROR: missing canonical Ontology value")
		}
	}
	return texts, values, nil
}
func (b previewBuilder) snapshot(ctx context.Context, name, head string) (branchSnapshot, error) {
	if !strings.HasPrefix(head, "commit/") {
		return branchSnapshot{}, fmt.Errorf("RESOURCE_ERROR: Branch Head is not pinned")
	}
	commit, err := b.kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: head})
	if err != nil {
		return branchSnapshot{}, err
	}
	if commit.State != head {
		return branchSnapshot{}, fmt.Errorf("RESOURCE_ERROR: Commit metadata changed")
	}
	overview, err := b.paginate(ctx, head, "")
	if err != nil {
		return branchSnapshot{}, err
	}
	domainMap, definitionMap, members, err := b.collect(ctx, head, overview)
	if err != nil {
		return branchSnapshot{}, err
	}
	domainRefs := sortedRefs(domainMap)
	definitionRefs := sortedRefs(definitionMap)
	refs := append(append(make([]string, 0, len(domainRefs)+len(definitionRefs)), domainRefs...), definitionRefs...)
	texts, values, err := b.loadBodies(ctx, head, refs)
	if err != nil {
		return branchSnapshot{}, err
	}
	snapshot := branchSnapshot{name: name, head: head, commit: commit}
	for _, ref := range domainRefs {
		snapshot.domains = append(snapshot.domains, previewDomain{summary: domainMap[ref], body: texts[ref], members: members[ref]})
	}
	for _, ref := range definitionRefs {
		snapshot.definitions = append(snapshot.definitions, previewDefinition{summary: definitionMap[ref], body: texts[ref], value: values[ref]})
	}
	return snapshot, nil
}

func newPreviewRevision() (string, error) {
	var token [16]byte
	if _, err := rand.Read(token[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(token[:]), nil
}

func definitionGraph(definitions []previewDefinition) (string, error) {
	lines := []string{"flowchart LR"}
	ids := make(map[string]string, len(definitions))
	for idx, definition := range definitions {
		id := fmt.Sprintf("d%d", idx)
		ids[definition.summary.Ref] = id
		lines = append(lines, fmt.Sprintf("  %s[\"%s\"]", id, mermaidLabel(definition.summary.Ref)))
	}
	for _, definition := range definitions {
		if definition.summary.Kind != kernel.KindRelationshipDefinition {
			continue
		}
		var value map[string]json.RawMessage
		if err := json.Unmarshal(definition.value, &value); err != nil || value == nil {
			return "", fmt.Errorf("RESOURCE_ERROR: Relationship Definition value is invalid")
		}
		endpoints := make([]string, 2)
		for index, key := range []string{"from", "to"} {
			raw, found := value[key]
			if !found || string(raw) == "null" {
				continue
			}
			if err := json.Unmarshal(raw, &endpoints[index]); err != nil {
				return "", fmt.Errorf("RESOURCE_ERROR: invalid Relationship endpoint")
			}
		}
		from, hasFrom := ids[endpoints[0]]
		to, hasTo := ids[endpoints[1]]
		if hasFrom && hasTo {
			lines = append(lines, fmt.Sprintf("  %s -->|\"%s\"| %s", from, mermaidLabel(definition.summary.Ref), to))
		} else {
			lines = append(lines, fmt.Sprintf("  %s[\"%s\"]", ids[definition.summary.Ref], mermaidLabel(definition.summary.Ref+"（端点无类型约束或未在模型中）")))
		}
	}
	return strings.Join(lines, "\n"), nil
}

func renderBranch(d *viewDoc, snapshot branchSnapshot, id int) error {
	if err := d.begin(id); err != nil {
		return err
	}
	parents := make([]string, len(snapshot.commit.Parents))
	for i, p := range snapshot.commit.Parents {
		parents[i] = navigation(p)
	}
	parentText := strings.Join(parents, ", ")
	if parentText == "" {
		parentText = "—"
	}
	d.lines = append(d.lines, fmt.Sprintf("## %s", navigation(snapshot.name)), "",
		fmt.Sprintf("**Ref:** %s", navigation("branch/"+snapshot.name)),
		fmt.Sprintf("**State:** %s", navigation(snapshot.head)),
		"", "### Head Commit", "", "| Field | Value |", "| --- | --- |",
		fmt.Sprintf("| Author | %s |", navigation(previewString(snapshot.commit.Author))),
		"| Message | 见下文原文代码块 |",
		fmt.Sprintf("| Committed At | %d（UTC Unix microseconds） |", snapshot.commit.CommittedAt),
		fmt.Sprintf("| Parents | %s |", parentText),
		"", "### Commit Message", "")
	commitMessage(&d.lines, snapshot.commit.Message)
	d.lines = append(d.lines, "", "### Ontology", "", "#### 目录", "")
	graphID, domainID, indexID, detailsID := d.reserve(), d.reserve(), d.reserve(), d.reserve()
	d.lines = append(d.lines, "| Section | Offset | Lines |", "| --- | ---: | ---: |")
	d.addIndexLine(func() string {
		return fmt.Sprintf("| 模型关系图 | %s | %s |", d.offset(graphID), d.length(graphID))
	})
	d.addIndexLine(func() string {
		return fmt.Sprintf("| Domain 组织 | %s | %s |", d.offset(domainID), d.length(domainID))
	})
	d.addIndexLine(func() string {
		return fmt.Sprintf("| Definition 索引 | %s | %s |", d.offset(indexID), d.length(indexID))
	})
	d.addIndexLine(func() string {
		return fmt.Sprintf("| Definition 详情 | %s | %s |", d.offset(detailsID), d.length(detailsID))
	})
	d.lines = append(d.lines, "")

	if err := d.begin(graphID); err != nil {
		return err
	}
	d.lines = append(d.lines, "#### 模型关系图", "")
	graph, err := definitionGraph(snapshot.definitions)
	if err != nil {
		return err
	}
	appendFence(&d.lines, graph, "mermaid")
	d.lines = append(d.lines, "")
	if err := d.end(graphID); err != nil {
		return err
	}

	if err := d.begin(domainID); err != nil {
		return err
	}
	d.lines = append(d.lines, "#### Domain 组织", "", "| Domain Ref | Title | Description |", "| --- | --- | --- |")
	for _, domain := range snapshot.domains {
		d.lines = append(d.lines, fmt.Sprintf("| %s | %s | %s |", navigation(domain.summary.Ref), navigation(previewString(domain.summary.Title)), navigation(previewString(domain.summary.Description))))
	}
	d.lines = append(d.lines, "", "| Domain Ref | Member Ref |", "| --- | --- |")
	for _, domain := range snapshot.domains {
		for _, member := range domain.members {
			d.lines = append(d.lines, fmt.Sprintf("| %s | %s |", navigation(domain.summary.Ref), navigation(member.Ref)))
		}
	}
	d.lines = append(d.lines, "")
	for _, domain := range snapshot.domains {
		d.lines = append(d.lines, fmt.Sprintf("##### %s", navigation(domain.summary.Ref)), "")
		appendFence(&d.lines, domain.body, "yaml")
		d.lines = append(d.lines, "")
	}
	if err := d.end(domainID); err != nil {
		return err
	}

	definitionIDs := make([]int, len(snapshot.definitions))
	for i := range definitionIDs {
		definitionIDs[i] = d.reserve()
	}
	if err := d.begin(indexID); err != nil {
		return err
	}
	d.lines = append(d.lines, "#### Definition 索引", "", "| Ref | Title | Description | Offset | Lines |", "| --- | --- | --- | ---: | ---: |")
	for idx, definition := range snapshot.definitions {
		d.addIndexLine(func() string {
			return fmt.Sprintf("| %s | %s | %s | %s | %s |",
				navigation(definition.summary.Ref),
				navigation(previewString(definition.summary.Title)),
				navigation(previewString(definition.summary.Description)),
				d.offset(definitionIDs[idx]), d.length(definitionIDs[idx]))
		})
	}
	d.lines = append(d.lines, "")
	if err := d.end(indexID); err != nil {
		return err
	}
	if err := d.begin(detailsID); err != nil {
		return err
	}
	d.lines = append(d.lines, "#### Definition 详情", "")
	for index, definition := range snapshot.definitions {
		if err := d.begin(definitionIDs[index]); err != nil {
			return err
		}
		d.lines = append(d.lines, fmt.Sprintf("##### %s", navigation(definition.summary.Ref)), "")
		appendFence(&d.lines, definition.body, "yaml")
		d.lines = append(d.lines, "")
		if err := d.end(definitionIDs[index]); err != nil {
			return err
		}
	}
	if err := d.end(detailsID); err != nil {
		return err
	}
	return d.end(id)
}

func renderPreview(ctx context.Context, k *kernel.Service, maxItems int) ([]string, error) {
	remaining := maxMarkdownBytes
	b := previewBuilder{kernel: k, maxItems: maxItems, remainingBytes: &remaining}
	overview, err := k.EvolutionOverview(ctx)
	if err != nil {
		return nil, err
	}
	refs, err := k.EvolutionBranchList(ctx)
	if err != nil {
		return nil, err
	}
	sort.Slice(refs.Items, func(i, j int) bool { return refs.Items[i].Name < refs.Items[j].Name })
	snapshots := make([]branchSnapshot, 0, len(refs.Items))
	for _, branch := range refs.Items {
		snapshot, err := b.snapshot(ctx, branch.Name, branch.State)
		if err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snapshot)
	}
	d := newViewDoc()
	ids := make([]int, len(snapshots))
	for i := range ids {
		ids[i] = d.reserve()
	}
	defaultBranch := overview.DefaultBranch
	if !strings.HasPrefix(defaultBranch, "branch/") {
		defaultBranch = "branch/" + defaultBranch
	}
	d.lines = append(d.lines, "# 分支", "", fmt.Sprintf("**Default:** %s", navigation(defaultBranch)), "",
		"| Branch | Head Commit | 当前简介（首行） | Offset | Lines |",
		"| --- | --- | --- | ---: | ---: |")
	for idx, snapshot := range snapshots {
		d.addIndexLine(func() string {
			return fmt.Sprintf("| %s | %s | %s | %s | %s |", navigation(snapshot.name), navigation(snapshot.head),
				navigation(summaryFromMessage(snapshot.commit.Message)), d.offset(ids[idx]), d.length(ids[idx]))
		})
	}
	d.lines = append(d.lines, "", "---", "")
	for idx, snapshot := range snapshots {
		if err := renderBranch(d, snapshot, ids[idx]); err != nil {
			return nil, err
		}
	}
	return d.finish()
}

func (s *Server) preview(ctx context.Context, principal string, input PreviewInput) (PreviewOutput, error) {
	limit := 300
	if input.Limit != nil {
		limit = *input.Limit
	}
	if limit < 100 || limit > 500 || input.Offset < 0 {
		return PreviewOutput{}, fmt.Errorf("INVALID_ARGUMENT: Invalid preview line window")
	}
	now := time.Now()
	s.previewCache.mu.Lock()
	if s.previewCache.entries == nil {
		s.previewCache.entries = make(map[string]previewCacheEntry)
	}
	s.previewCache.prune(now)
	entry, exists := s.previewCache.entries[input.ViewRevision]
	if input.ViewRevision != "" && (!exists || entry.principal != principal) {
		s.previewCache.mu.Unlock()
		return PreviewOutput{}, fmt.Errorf("VIEW_EXPIRED: Preview revision is expired or unavailable")
	}
	s.previewCache.mu.Unlock()
	revision := input.ViewRevision
	if !exists {
		lines, err := renderPreview(ctx, s.kernel, s.previewMaxItems)
		if err != nil {
			return PreviewOutput{}, err
		}
		revision, err = newPreviewRevision()
		if err != nil {
			return PreviewOutput{}, err
		}
		entry = previewCacheEntry{lines: lines, expires: time.Now().Add(s.previewCacheTTL), principal: principal}
		s.previewCache.mu.Lock()
		s.previewCache.prune(time.Now())
		for len(s.previewCache.entries) >= s.previewCacheEntries {
			oldest := s.previewCache.order[0]
			s.previewCache.order = s.previewCache.order[1:]
			if _, ok := s.previewCache.entries[oldest]; ok {
				delete(s.previewCache.entries, oldest)
				break
			}
		}
		s.previewCache.entries[revision] = entry
		s.previewCache.order = append(s.previewCache.order, revision)
		s.previewCache.mu.Unlock()
	}
	if input.Offset > len(entry.lines) {
		return PreviewOutput{}, fmt.Errorf("INVALID_ARGUMENT: offset exceeds totalLines")
	}
	end := min(input.Offset+limit, len(entry.lines))
	page := entry.lines[input.Offset:end]
	text := ""
	if len(page) > 0 {
		text = strings.Join(page, "\n") + "\n"
	}
	return PreviewOutput{TotalLines: len(entry.lines), Offset: input.Offset, LineCount: len(page), ViewRevision: revision, Preview: text}, nil
}
