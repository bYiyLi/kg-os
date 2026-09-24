package kernel

import "encoding/json"

const defaultEvolutionLimit = 100
const maxEvolutionLimit = 1000

type ConsistencyIssue struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ConsistencyStatus struct {
	Status string             `json:"status"`
	Issues []ConsistencyIssue `json:"issues"`
}

type StateSummary struct {
	State       string   `json:"state"`
	Parents     []string `json:"parents"`
	Author      *string  `json:"author,omitempty"`
	Message     *string  `json:"message,omitempty"`
	CommittedAt int64    `json:"committedAt"`
}

type EvolutionOverviewResult struct {
	DefaultBranch string `json:"defaultBranch"`
	State         string `json:"state"`
}

type EvolutionGetRequest struct {
	State string `json:"state"`
}

type EvolutionGetResult struct {
	State       string            `json:"state"`
	Parents     []string          `json:"parents"`
	Author      *string           `json:"author,omitempty"`
	Message     *string           `json:"message,omitempty"`
	CommittedAt int64             `json:"committedAt"`
	Consistency ConsistencyStatus `json:"consistency"`
	HasData     bool              `json:"hasData"`
	Data        json.RawMessage   `json:"data"`
}

type EvolutionAncestryRequest struct {
	Root   string `json:"root"`
	Limit  int    `json:"limit,omitempty"`
	Cursor string `json:"cursor,omitempty"`
}

type EvolutionAncestryResult struct {
	Root   string         `json:"root"`
	Items  []StateSummary `json:"items"`
	Cursor string         `json:"cursor,omitempty"`
}

type EvolutionObjectFilter struct {
	AnchorState string `json:"anchorState"`
	Ref         string `json:"ref"`
}

type EvolutionDiffRequest struct {
	Before string                 `json:"before"`
	After  string                 `json:"after"`
	Scope  string                 `json:"scope"`
	Object *EvolutionObjectFilter `json:"object,omitempty"`
	Limit  int                    `json:"limit,omitempty"`
	Cursor string                 `json:"cursor,omitempty"`
}

type Change struct {
	Change      string          `json:"change"`
	Kind        ObjectKind      `json:"kind"`
	Path        string          `json:"path"`
	BeforeRef   string          `json:"beforeRef,omitempty"`
	AfterRef    string          `json:"afterRef,omitempty"`
	RelatedRefs []string        `json:"relatedRefs,omitempty"`
	Before      json.RawMessage `json:"before,omitempty"`
	After       json.RawMessage `json:"after,omitempty"`

	identity string
}

type EvolutionDiffResult struct {
	Before string   `json:"before"`
	After  string   `json:"after"`
	Items  []Change `json:"items"`
	Cursor string   `json:"cursor,omitempty"`
}

type EvolutionHistoryRequest struct {
	Root   string                 `json:"root"`
	Scope  string                 `json:"scope"`
	Object *EvolutionObjectFilter `json:"object,omitempty"`
	Limit  int                    `json:"limit,omitempty"`
	Cursor string                 `json:"cursor,omitempty"`
}

type HistoryEntry struct {
	State   string   `json:"state"`
	Parents []string `json:"parents"`
	Change  *Change  `json:"change"`
}

type EvolutionHistoryResult struct {
	Root   string         `json:"root"`
	Items  []HistoryEntry `json:"items"`
	Cursor string         `json:"cursor,omitempty"`
}

type StateCreateRequest struct {
	Branch  string          `json:"branch"`
	Data    json.RawMessage `json:"data,omitempty"`
	Author  *string         `json:"author,omitempty"`
	Message *string         `json:"message,omitempty"`
}

type StateCreateResult struct {
	State string `json:"state"`
}

type StateSetDataRequest struct {
	State string          `json:"state"`
	Data  json.RawMessage `json:"data"`
}

type StateSetDataResult struct {
	State string          `json:"state"`
	Data  json.RawMessage `json:"data"`
}

type StateClearDataRequest struct {
	State string `json:"state"`
}

type StateClearDataResult struct {
	State string `json:"state"`
}

type EvolutionRefItem struct {
	Name  string `json:"name"`
	State string `json:"state"`
}

type EvolutionRefListResult struct {
	Items []EvolutionRefItem `json:"items"`
}

type BranchCreateRequest struct {
	Name string `json:"name"`
	From string `json:"from"`
}

type BranchDeleteRequest struct {
	Name string `json:"name"`
}

type BranchMutationResult struct {
	Name          string `json:"name"`
	State         string `json:"state,omitempty"`
	PreviousState string `json:"previousState,omitempty"`
}

type TagCreateRequest struct {
	Name   string `json:"name"`
	Target string `json:"target"`
}

type TagMoveRequest struct {
	Name   string `json:"name"`
	Target string `json:"target"`
}

type TagDeleteRequest struct {
	Name string `json:"name"`
}

type TagMutationResult struct {
	Name          string `json:"name"`
	State         string `json:"state,omitempty"`
	PreviousState string `json:"previousState,omitempty"`
}
