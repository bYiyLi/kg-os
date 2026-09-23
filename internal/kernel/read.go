package kernel

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"sort"
	"strconv"
	"strings"
)

const (
	defaultReadLimit = 100
	maxReadLimit     = 1000
	maxBatchRefs     = 100
	maxReadBytes     = 8 << 20
)

type readCursor struct {
	Version int    `json:"v"`
	State   string `json:"state"`
	Scope   string `json:"scope"`
	Offset  int    `json:"offset"`
}

func (service *Service) ReadOntology(ctx context.Context, request OntologyReadRequest) (OntologyReadResult, error) {
	if request.At == "" {
		return OntologyReadResult{}, publicError(CodeInvalidArgument, "at is required", nil)
	}
	if len(request.Refs) > maxBatchRefs {
		return OntologyReadResult{}, publicError(CodeInvalidArgument, "Ontology read accepts at most 100 refs", nil)
	}
	seen := map[string]struct{}{}
	parsedRefs := make([]OntologyRef, 0, len(request.Refs))
	for _, raw := range request.Refs {
		if _, exists := seen[raw]; exists {
			return OntologyReadResult{}, publicError(CodeInvalidArgument, "duplicate Ontology Ref", nil)
		}
		seen[raw] = struct{}{}
		ref, err := ParseOntologyRef(raw)
		if err != nil {
			return OntologyReadResult{}, err
		}
		parsedRefs = append(parsedRefs, ref)
	}
	limit := request.Limit
	if limit == 0 {
		limit = defaultReadLimit
	}
	if limit < 1 || limit > maxReadLimit {
		return OntologyReadResult{}, publicError(CodeInvalidArgument, "limit must be between 1 and 1000", nil)
	}
	if request.Cursor != "" {
		if len(parsedRefs) > 1 || (len(parsedRefs) == 1 && parsedRefs[0].Kind != KindDomain) {
			return OntologyReadResult{}, publicError(CodeInvalidArgument, "cursor is valid only for Overview or a single Domain", nil)
		}
	}

	snapshot, err := service.decodeSnapshot(ctx, request.At)
	if err != nil {
		return OntologyReadResult{}, err
	}
	result := OntologyReadResult{State: snapshot.State, Results: []OntologyReadItem{}}
	if len(parsedRefs) == 0 {
		item, itemErr := renderOverview(snapshot, limit, request.Cursor)
		if itemErr != nil {
			return OntologyReadResult{}, itemErr
		}
		result.Results = append(result.Results, item)
		return enforceReadBudget(result)
	}

	for _, ref := range parsedRefs {
		var item OntologyReadItem
		switch ref.Kind {
		case KindDomain:
			item, err = renderDomain(snapshot, ref, limit, request.Cursor)
		case KindNodeDefinition, KindRelationshipDefinition:
			if request.Cursor != "" {
				err = publicError(CodeInvalidArgument, "Definition read does not accept cursor", nil)
			} else {
				item, err = renderDefinition(snapshot, ref)
			}
		default:
			err = publicError(CodeInvalidArgument, "invalid Ontology Ref kind", nil)
		}
		if err != nil {
			return OntologyReadResult{}, err
		}
		result.Results = append(result.Results, item)
	}
	return enforceReadBudget(result)
}

func (service *Service) ReadObject(ctx context.Context, at, rawRef string) (ObjectBody, error) {
	if at == "" {
		return ObjectBody{}, publicError(CodeInvalidArgument, "at is required", nil)
	}
	ref, err := ParseOntologyRef(rawRef)
	if err != nil {
		return ObjectBody{}, err
	}
	snapshot, err := service.decodeSnapshot(ctx, at)
	if err != nil {
		return ObjectBody{}, err
	}
	value, err := snapshot.objectValue(ref)
	if err != nil {
		return ObjectBody{}, err
	}
	yamlBody, err := RenderObjectYAML(value)
	if err != nil {
		return ObjectBody{}, err
	}
	jsonBody, err := RenderObjectJSON(value)
	if err != nil {
		return ObjectBody{}, err
	}
	if len(yamlBody) > maxReadBytes || len(jsonBody) > maxReadBytes {
		return ObjectBody{}, publicError(CodeResource, "Object body exceeds response resource limit", nil)
	}
	return ObjectBody{
		State: snapshot.State,
		Ref:   ref.String(),
		Kind:  ref.Kind,
		Value: value,
		YAML:  yamlBody,
		JSON:  jsonBody,
	}, nil
}

func (snapshot *snapshot) objectValue(ref OntologyRef) (ObjectValue, error) {
	switch ref.Kind {
	case KindDomain:
		record := snapshot.Domains[ref.Name]
		if record == nil {
			return ObjectValue{}, objectNotFound(ref)
		}
		value := cloneDomain(record.Value)
		return ObjectValue{Kind: KindDomain, Domain: &value}, nil
	case KindNodeDefinition, KindRelationshipDefinition:
		record := snapshot.Definitions[ref]
		if record == nil {
			return ObjectValue{}, objectNotFound(ref)
		}
		value := cloneDefinition(record.Value)
		return ObjectValue{Kind: ref.Kind, Definition: &value}, nil
	default:
		return ObjectValue{}, publicError(CodeInvalidArgument, "unsupported Ontology object kind", nil)
	}
}

func objectNotFound(ref OntologyRef) error {
	return errorWithDetails(CodeObjectNotFound, "Ontology object was not found", map[string]any{"ref": ref.String()})
}

func renderOverview(snapshot *snapshot, limit int, cursor string) (OntologyReadItem, error) {
	classified := map[OntologyRef]bool{}
	for _, domain := range snapshot.Domains {
		for _, raw := range domain.Value.Includes {
			ref, err := ParseOntologyRef(raw)
			if err == nil && ref.Kind != KindDomain {
				classified[ref] = true
			}
		}
	}
	items := make([]Summary, 0, len(snapshot.Domains)+len(snapshot.Definitions))
	for _, domain := range snapshot.Domains {
		items = append(items, domainSummary(domain.Value))
	}
	for ref, definition := range snapshot.Definitions {
		if !classified[ref] {
			items = append(items, definitionSummary(definition.Value))
		}
	}
	sortSummaries(items)
	page, next, err := paginateSummaries(snapshot.State, "overview", items, limit, cursor)
	if err != nil {
		return OntologyReadItem{}, err
	}
	item := OntologyReadItem{
		Kind:   "overview",
		Items:  page,
		Total:  len(items),
		Cursor: next,
	}
	item.Markdown = overviewMarkdown(snapshot.State, item)
	return item, nil
}

func renderDomain(snapshot *snapshot, ref OntologyRef, limit int, cursor string) (OntologyReadItem, error) {
	record := snapshot.Domains[ref.Name]
	if record == nil {
		return OntologyReadItem{}, objectNotFound(ref)
	}
	items := make([]Summary, 0, len(record.Value.Includes))
	for _, raw := range record.Value.Includes {
		memberRef, err := ParseOntologyRef(raw)
		if err != nil {
			return OntologyReadItem{}, consistencyWrap("Domain contains an invalid member Ref", err)
		}
		summary, err := snapshot.summary(memberRef)
		if err != nil {
			return OntologyReadItem{}, consistencyWrap("Domain contains a missing member", err)
		}
		items = append(items, summary)
	}
	sortSummaries(items)
	page, next, err := paginateSummaries(snapshot.State, ref.String(), items, limit, cursor)
	if err != nil {
		return OntologyReadItem{}, err
	}
	item := OntologyReadItem{
		Ref:         ref.String(),
		Kind:        "domain",
		Title:       record.Value.Title,
		Description: record.Value.Description,
		Items:       page,
		Total:       len(items),
		Cursor:      next,
	}
	item.Markdown = domainMarkdown(snapshot.State, record.Value, item)
	return item, nil
}

func renderDefinition(snapshot *snapshot, ref OntologyRef) (OntologyReadItem, error) {
	record := snapshot.Definitions[ref]
	if record == nil {
		return OntologyReadItem{}, objectNotFound(ref)
	}
	item := OntologyReadItem{
		Ref:         ref.String(),
		Kind:        string(ref.Kind),
		Title:       record.Value.Title,
		Description: record.Value.Description,
		Items:       []Summary{},
		Total:       0,
	}
	item.Markdown = definitionMarkdown(snapshot.State, record.Value)
	return item, nil
}

func (snapshot *snapshot) summary(ref OntologyRef) (Summary, error) {
	switch ref.Kind {
	case KindDomain:
		domain := snapshot.Domains[ref.Name]
		if domain == nil {
			return Summary{}, objectNotFound(ref)
		}
		return domainSummary(domain.Value), nil
	case KindNodeDefinition, KindRelationshipDefinition:
		definition := snapshot.Definitions[ref]
		if definition == nil {
			return Summary{}, objectNotFound(ref)
		}
		return definitionSummary(definition.Value), nil
	default:
		return Summary{}, publicError(CodeInvalidArgument, "invalid Ontology Ref kind", nil)
	}
}

func domainSummary(domain Domain) Summary {
	return Summary{
		Kind:        KindDomain,
		Ref:         OntologyRef{Kind: KindDomain, Name: domain.Name}.String(),
		Name:        domain.Name,
		Title:       domain.Title,
		Description: domain.Description,
	}
}

func definitionSummary(definition Definition) Summary {
	return Summary{
		Kind:        definition.Kind,
		Ref:         OntologyRef{Kind: definition.Kind, Name: definition.Name}.String(),
		Name:        definition.Name,
		Title:       definition.Title,
		Description: definition.Description,
		From:        definition.From,
		To:          definition.To,
	}
}

func sortSummaries(items []Summary) {
	sort.Slice(items, func(i, j int) bool {
		left := string(items[i].Kind) + "\x00" + items[i].Ref
		right := string(items[j].Kind) + "\x00" + items[j].Ref
		return left < right
	})
}

func paginateSummaries(state, scope string, items []Summary, limit int, rawCursor string) ([]Summary, string, error) {
	offset := 0
	if rawCursor != "" {
		cursor, err := decodeReadCursor(rawCursor)
		if err != nil {
			return nil, "", err
		}
		if cursor.State != state || cursor.Scope != scope || cursor.Offset < 0 || cursor.Offset > len(items) {
			return nil, "", publicError(CodeInvalidArgument, "cursor does not match the resolved State and scope", nil)
		}
		offset = cursor.Offset
	}
	end := offset + limit
	if end > len(items) {
		end = len(items)
	}
	page := append([]Summary(nil), items[offset:end]...)
	if end == len(items) {
		return page, "", nil
	}
	next, err := encodeReadCursor(readCursor{Version: 1, State: state, Scope: scope, Offset: end})
	return page, next, err
}

func encodeReadCursor(cursor readCursor) (string, error) {
	body, err := json.Marshal(cursor)
	if err != nil {
		return "", publicError(CodeInternal, "encode Ontology cursor", err)
	}
	return base64.RawURLEncoding.EncodeToString(body), nil
}

func decodeReadCursor(raw string) (readCursor, error) {
	body, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return readCursor{}, publicError(CodeInvalidArgument, "invalid Ontology cursor", err)
	}
	var cursor readCursor
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cursor); err != nil || cursor.Version != 1 {
		return readCursor{}, publicError(CodeInvalidArgument, "invalid Ontology cursor", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return readCursor{}, publicError(CodeInvalidArgument, "invalid Ontology cursor", err)
	}
	return cursor, nil
}

func enforceReadBudget(result OntologyReadResult) (OntologyReadResult, error) {
	body, err := json.Marshal(result)
	if err != nil {
		return OntologyReadResult{}, publicError(CodeInternal, "encode Ontology read result", err)
	}
	if len(body) > maxReadBytes {
		return OntologyReadResult{}, publicError(CodeResource, "Ontology read result exceeds response resource limit", nil)
	}
	return result, nil
}

func overviewMarkdown(state string, item OntologyReadItem) string {
	var builder strings.Builder
	writeMarkdownHeader(&builder, state, "overview", "", item.Total, item.Cursor)
	builder.WriteString("# Ontology\n\n")
	if len(item.Items) == 0 {
		builder.WriteString("当前 State 没有调用方 Ontology 定义。\n")
		return builder.String()
	}
	for _, summary := range item.Items {
		writeSummaryMarkdown(&builder, summary)
	}
	return builder.String()
}

func domainMarkdown(state string, domain Domain, item OntologyReadItem) string {
	var builder strings.Builder
	writeMarkdownHeader(&builder, state, "domain", item.Ref, item.Total, item.Cursor)
	builder.WriteString("# ")
	builder.WriteString(domain.Name)
	if domain.Title != nil {
		builder.WriteString(" · ")
		builder.WriteString(*domain.Title)
	}
	builder.WriteString("\n\n")
	builder.WriteString(descriptionOrMissing(domain.Description))
	builder.WriteString("\n\n")
	for _, summary := range item.Items {
		writeSummaryMarkdown(&builder, summary)
	}
	return builder.String()
}

func definitionMarkdown(state string, definition Definition) string {
	ref := OntologyRef{Kind: definition.Kind, Name: definition.Name}.String()
	var builder strings.Builder
	writeMarkdownHeader(&builder, state, string(definition.Kind), ref, 0, "")
	builder.WriteString("# ")
	builder.WriteString(definition.Name)
	if definition.Title != nil {
		builder.WriteString(" · ")
		builder.WriteString(*definition.Title)
	}
	builder.WriteString("\n\n")
	builder.WriteString(descriptionOrMissing(definition.Description))
	builder.WriteString("\n\n")
	if definition.Kind == KindNodeDefinition {
		builder.WriteString("- Ref: `")
		builder.WriteString(ref)
		builder.WriteString("`\n")
		if len(definition.Labels) != 0 {
			builder.WriteString("- Additional labels: ")
			builder.WriteString(strings.Join(definition.Labels, ", "))
			builder.WriteByte('\n')
		}
	} else {
		builder.WriteString("- Ref: `")
		builder.WriteString(ref)
		builder.WriteString("`\n- Endpoints: ")
		builder.WriteString(endpointText(definition.From))
		builder.WriteString(" → ")
		builder.WriteString(endpointText(definition.To))
		builder.WriteByte('\n')
	}
	builder.WriteString("\n## Properties\n\n")
	for _, property := range definition.Properties {
		builder.WriteString("- `")
		builder.WriteString(property.Name)
		builder.WriteString("` — ")
		builder.WriteString(property.Type)
		if property.Required {
			builder.WriteString("; required")
		}
		if property.Unique {
			builder.WriteString("; unique")
		}
		builder.WriteString(" — ")
		builder.WriteString(descriptionOrMissing(property.Description))
		builder.WriteByte('\n')
		for _, index := range property.Indexes {
			builder.WriteString("  - index `")
			builder.WriteString(index.Name)
			builder.WriteString("` (")
			builder.WriteString(index.Type)
			builder.WriteString(")\n")
		}
	}
	if len(definition.Constraints) != 0 {
		builder.WriteString("\n## Constraints\n\n")
		for _, constraint := range definition.Constraints {
			builder.WriteString("- ")
			if constraint.Name != "" {
				builder.WriteString("`")
				builder.WriteString(constraint.Name)
				builder.WriteString("` ")
			}
			builder.WriteString(constraint.Type)
			if len(constraint.Properties) != 0 {
				builder.WriteString(" [")
				builder.WriteString(strings.Join(constraint.Properties, ", "))
				builder.WriteString("]")
			}
			builder.WriteByte('\n')
		}
	}
	if len(definition.Indexes) != 0 {
		builder.WriteString("\n## Indexes\n\n")
		for _, index := range definition.Indexes {
			builder.WriteString("- `")
			builder.WriteString(index.Name)
			builder.WriteString("` (")
			builder.WriteString(index.Type)
			builder.WriteString(")")
			if len(index.Targets) != 0 {
				builder.WriteString(" targets=")
				builder.WriteString(strings.Join(index.Targets, ","))
			}
			if len(index.Properties) != 0 {
				builder.WriteString(" properties=")
				builder.WriteString(strings.Join(index.Properties, ","))
			}
			builder.WriteByte('\n')
		}
	}
	return builder.String()
}

func writeMarkdownHeader(builder *strings.Builder, state, kind, ref string, total int, cursor string) {
	builder.WriteString("---\nstate: ")
	builder.WriteString(strconv.Quote(state))
	builder.WriteString("\nkind: ")
	builder.WriteString(strconv.Quote(kind))
	if ref == "" {
		builder.WriteString("\nref: null")
	} else {
		builder.WriteString("\nref: ")
		builder.WriteString(strconv.Quote(ref))
	}
	builder.WriteString("\ntotal: ")
	builder.WriteString(strconv.Itoa(total))
	if cursor == "" {
		builder.WriteString("\ncursor: null")
	} else {
		builder.WriteString("\ncursor: ")
		builder.WriteString(strconv.Quote(cursor))
	}
	builder.WriteString("\n---\n")
}

func writeSummaryMarkdown(builder *strings.Builder, summary Summary) {
	builder.WriteString("- **")
	builder.WriteString(summary.Name)
	if summary.Title != nil {
		builder.WriteString("（")
		builder.WriteString(*summary.Title)
		builder.WriteString("）")
	}
	builder.WriteString("**")
	if summary.Kind == KindRelationshipDefinition {
		builder.WriteString(" — ")
		builder.WriteString(endpointText(summary.From))
		builder.WriteString(" → ")
		builder.WriteString(endpointText(summary.To))
	}
	builder.WriteString(" — ")
	builder.WriteString(descriptionOrMissing(summary.Description))
	builder.WriteString(" `")
	builder.WriteString(summary.Ref)
	builder.WriteString("`\n")
}

func descriptionOrMissing(description *string) string {
	if description == nil {
		return "未提供说明"
	}
	return *description
}

func endpointText(endpoint *string) string {
	if endpoint == nil {
		return "any"
	}
	return *endpoint
}

func cloneDomain(value Domain) Domain {
	copyValue := value
	copyValue.Includes = append([]string(nil), value.Includes...)
	return copyValue
}

func cloneDefinition(value Definition) Definition {
	raw, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var copyValue Definition
	if err := json.Unmarshal(raw, &copyValue); err != nil {
		return value
	}
	copyValue.Kind = value.Kind
	for i := range value.Properties {
		for j := range value.Properties[i].Indexes {
			if i < len(copyValue.Properties) && j < len(copyValue.Properties[i].Indexes) {
				copyValue.Properties[i].Indexes[j].hiddenOptions =
					cloneAnyMap(value.Properties[i].Indexes[j].hiddenOptions)
			}
		}
	}
	for i := range value.Indexes {
		if i < len(copyValue.Indexes) {
			copyValue.Indexes[i].hiddenOptions = cloneAnyMap(value.Indexes[i].hiddenOptions)
		}
	}
	return copyValue
}

func validateResolvedState(value string) error {
	if !strings.HasPrefix(value, "commit/") || len(value) != len("commit/")+64 {
		return publicError(CodeInvalidArgument, "resolved State must be commit/<64-hex>", nil)
	}
	for _, r := range strings.TrimPrefix(value, "commit/") {
		if !strings.ContainsRune("0123456789abcdef", r) {
			return publicError(CodeInvalidArgument, "resolved State must be canonical lowercase commit/<64-hex>", nil)
		}
	}
	return nil
}

func validateBranchName(branch string) error {
	if strings.TrimSpace(branch) == "" {
		return publicError(CodeInvalidArgument, "branch is required", nil)
	}
	if strings.ContainsRune(branch, 0) {
		return publicError(CodeInvalidArgument, "branch contains NUL", nil)
	}
	return nil
}
