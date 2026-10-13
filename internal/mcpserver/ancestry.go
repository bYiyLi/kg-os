package mcpserver

import (
	"context"
	"fmt"
	"strings"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

type AncestryInput struct {
	Root   string `json:"root"`
	Limit  *int   `json:"limit,omitempty"`
	Cursor string `json:"cursor,omitempty"`
}
type AncestryOutput struct {
	Root     string `json:"root"`
	Count    int    `json:"count"`
	Cursor   string `json:"cursor,omitempty"`
	Markdown string `json:"markdown"`
}

func ancestryMetadata(item kernel.StateSummary) (string, string) {
	parents := make([]string, len(item.Parents))
	for i, p := range item.Parents {
		parents[i] = navigation(p)
	}
	parentText := strings.Join(parents, ", ")
	if parentText == "" {
		parentText = "—"
	}
	author := "—"
	if item.Author != nil {
		author = *item.Author
	}
	return parentText, author
}

func StateAncestry(ctx context.Context, k *kernel.Service, input AncestryInput) (AncestryOutput, error) {
	limit := 20
	if input.Limit != nil {
		limit = *input.Limit
	}
	if limit < 1 || limit > 1000 {
		return AncestryOutput{}, fmt.Errorf("INVALID_ARGUMENT: limit must be between 1 and 1000")
	}
	data, err := k.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{Root: input.Root, Limit: limit, Cursor: input.Cursor})
	if err != nil {
		return AncestryOutput{}, err
	}
	if !strings.HasPrefix(data.Root, "commit/") {
		return AncestryOutput{}, fmt.Errorf("RESOURCE_ERROR: ancestry did not resolve an immutable commit")
	}
	lines := []string{"# Version History", "", fmt.Sprintf("**Root:** %s", navigation(data.Root)), fmt.Sprintf("**Page Count:** %d", len(data.Items)), "", "## Commit DAG（本页）", ""}
	ids := make(map[string]string)
	present := make(map[string]bool)
	ordered := make([]string, 0, len(data.Items))
	assign := func(ref string) {
		if _, ok := ids[ref]; !ok {
			ids[ref] = fmt.Sprintf("n%d", len(ordered))
			ordered = append(ordered, ref)
		}
	}
	for _, item := range data.Items {
		present[item.State] = true
		assign(item.State)
		for _, parent := range item.Parents {
			assign(parent)
		}
	}
	graph := []string{"flowchart TD"}
	for _, state := range ordered {
		suffix := ""
		if !present[state] {
			suffix = "（未在本页展开）"
		}
		graph = append(graph, fmt.Sprintf("  %s[\"%s\"]", ids[state], mermaidLabel(state+suffix)))
	}
	for _, item := range data.Items {
		for _, parent := range item.Parents {
			graph = append(graph, fmt.Sprintf("  %s --> %s", ids[item.State], ids[parent]))
		}
	}
	appendFence(&lines, strings.Join(graph, "\n"), "mermaid")
	lines = append(lines, "", "## Commits", "", "| State | Parents | Author | Committed At (µs) |", "| --- | --- | --- | ---: |")
	for _, item := range data.Items {
		parentText, author := ancestryMetadata(item)
		lines = append(lines, fmt.Sprintf("| %s | %s | %s | %d |", navigation(item.State), parentText, navigation(author), item.CommittedAt))
	}
	lines = append(lines, "", "## Commit 详情", "")
	for _, item := range data.Items {
		parentText, author := ancestryMetadata(item)
		lines = append(lines, fmt.Sprintf("### %s", navigation(item.State)), "", fmt.Sprintf("**Parents:** %s", parentText), fmt.Sprintf("**Author:** %s", navigation(author)), fmt.Sprintf("**Committed At:** %d（UTC Unix microseconds）", item.CommittedAt), "", "#### Commit Message", "")
		commitMessage(&lines, item.Message)
		lines = append(lines, "")
	}
	rendered, err := completeMarkdown(lines)
	if err != nil {
		return AncestryOutput{}, err
	}
	return AncestryOutput{Root: data.Root, Count: len(data.Items), Cursor: data.Cursor, Markdown: rendered}, nil
}
