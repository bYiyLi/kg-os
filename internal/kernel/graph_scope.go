package kernel

import (
	"context"
	"encoding/json"
	"sort"
)

// resolveGraphQueryScope compiles a KG OS Domain into Lithograph's read-only
// Graph View, always against the exact immutable State used by the query.
// The Domain organizes Node Definitions; it does not assign instance ownership.
func (service *Service) resolveGraphQueryScope(
	ctx context.Context, request GraphQueryRequest,
) (string, json.RawMessage, error) {
	if len(request.Domain) == 0 {
		return request.At, request.GraphView, nil
	}
	var name string
	if err := json.Unmarshal(request.Domain, &name); err != nil {
		return "", nil, publicError(CodeInvalidArgument, "Graph query domain must be a string", err)
	}
	ref, err := ParseOntologyRef(name)
	if err != nil || ref.Kind != KindDomain {
		return "", nil, publicError(CodeInvalidArgument, "Graph query domain must be a canonical domain: Ref", err)
	}
	state, err := service.database.ResolveState(ctx, request.At)
	if err != nil {
		return "", nil, AsPublicError(err)
	}
	snapshot, err := service.decodeResolvedSnapshot(ctx, state)
	if err != nil {
		return "", nil, err
	}
	if snapshot.Domains[ref.Name] == nil {
		return "", nil, errorWithDetails(CodeObjectNotFound, "Domain was not found in this State", map[string]any{"ref": ref.String()})
	}
	labels := map[string]struct{}{}
	visited := map[string]struct{}{}
	pending := []string{ref.Name}
	for len(pending) > 0 {
		if err := ctx.Err(); err != nil {
			return "", nil, err
		}
		last := len(pending) - 1
		name := pending[last]
		pending = pending[:last]
		if _, ok := visited[name]; ok {
			continue
		}
		visited[name] = struct{}{}
		domain := snapshot.Domains[name]
		if domain == nil {
			return "", nil, publicError(CodeConsistency, "Domain includes an unknown Domain", nil)
		}
		for _, raw := range domain.Value.Includes {
			member, parseErr := ParseOntologyRef(raw)
			if parseErr != nil {
				return "", nil, publicError(CodeConsistency, "Domain includes an invalid Ref", parseErr)
			}
			switch member.Kind {
			case KindDomain:
				pending = append(pending, member.Name)
			case KindNodeDefinition:
				labels[member.Name] = struct{}{}
			}
		}
	}
	list := make([]string, 0, len(labels))
	for label := range labels {
		list = append(list, label)
	}
	sort.Strings(list)
	// An empty requireAnyLabels means an unrestricted graph. Use the internal
	// Label in both OR and NOT to guarantee an empty visible subgraph instead.
	if len(list) == 0 {
		list = []string{internalLabel}
	}
	view, err := json.Marshal(map[string]any{
		"requireAnyLabels": list,
		"excludeAnyLabels": []string{internalLabel},
	})
	if err != nil {
		return "", nil, publicError(CodeInternal, "encode Domain Graph View", err)
	}
	return state, view, nil
}
