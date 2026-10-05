package kernel

import (
	"context"
	"sort"
)

func (service *Service) EvolutionHistory(ctx context.Context, request EvolutionHistoryRequest) (EvolutionHistoryResult, error) {
	limit, err := evolutionLimit(request.Limit)
	if err != nil {
		return EvolutionHistoryResult{}, err
	}
	if err := validateEvolutionScope(request.Scope, request.Object); err != nil {
		return EvolutionHistoryResult{}, err
	}
	if err := validateStateRef(request.Root); err != nil {
		return EvolutionHistoryResult{}, err
	}
	root := ""
	resolvedAnchor := ""
	anchorIdentity := ""
	filterRef := ""
	state := ""
	lastKey := ""
	changeOffset := 0
	nativeCursor := ""
	if request.Cursor != "" {
		cursor, decodeErr := decodeEvolutionCursor(request.Cursor)
		if decodeErr != nil {
			return EvolutionHistoryResult{}, decodeErr
		}
		expectedAnchorRef := ""
		if request.Object != nil {
			expectedAnchorRef = request.Object.AnchorState
			filterRef = request.Object.Ref
		}
		if cursor.Op != "history" || cursor.RootRef != request.Root || cursor.Root == "" ||
			cursor.Scope != request.Scope || cursor.AnchorRef != expectedAnchorRef || cursor.Ref != filterRef {
			return EvolutionHistoryResult{}, publicError(CodeInvalidArgument, "cursor does not match History inputs", nil)
		}
		root = cursor.Root
		resolvedAnchor = cursor.Anchor
		state = cursor.State
		changeOffset = cursor.Offset
		lastKey = cursor.LastKey
		nativeCursor = cursor.Native
		if state != "" && (changeOffset < 1 || lastKey == "") {
			return EvolutionHistoryResult{}, publicError(CodeInvalidArgument, "invalid History cursor", nil)
		}
	} else {
		root, err = service.resolveValidEvolutionState(ctx, request.Root)
		if err != nil {
			return EvolutionHistoryResult{}, err
		}
		if request.Object != nil {
			filterRef = request.Object.Ref
			resolvedAnchor, err = service.resolveValidEvolutionState(ctx, request.Object.AnchorState)
			if err != nil {
				return EvolutionHistoryResult{}, err
			}
			if err := service.requireHistoryAnchor(ctx, root, resolvedAnchor); err != nil {
				return EvolutionHistoryResult{}, err
			}
		}
	}
	if request.Object != nil {
		anchorIdentity, err = service.resolvePublicObjectIdentity(ctx, resolvedAnchor, filterRef)
		if err != nil {
			return EvolutionHistoryResult{}, err
		}
	}

	items := make([]HistoryEntry, 0, limit)
	boundaryReached := false
	for len(items) < limit && !boundaryReached {
		var current string
		var parents []string
		var nextNative string
		if state != "" {
			current = state
			meta, getErr := service.database.GetCommit(ctx, current)
			if getErr != nil {
				return EvolutionHistoryResult{}, AsPublicError(getErr)
			}
			parents = append([]string(nil), meta.Parents...)
			nextNative = nativeCursor
		} else {
			var native *string
			if nativeCursor != "" {
				native = &nativeCursor
			}
			entries, logErr := service.database.Log(ctx, root, 1, native)
			if logErr != nil {
				return EvolutionHistoryResult{}, AsPublicError(logErr)
			}
			if len(entries) == 0 {
				break
			}
			entry := entries[0]
			current = entry.Commit
			parents = append([]string(nil), entry.Parents...)
			if entry.Cursor != nil {
				nextNative = *entry.Cursor
			}
		}

		if _, decodeErr := service.decodeResolvedSnapshot(ctx, current); decodeErr != nil {
			if !isConsistencyBoundary(decodeErr) {
				return EvolutionHistoryResult{}, AsPublicError(decodeErr)
			}
			boundaryReached = true
			break
		}

		changes := make([]Change, 0)
		genesis := len(parents) == 0
		if !genesis {
			if _, decodeErr := service.decodeResolvedSnapshot(ctx, parents[0]); decodeErr != nil {
				if !isConsistencyBoundary(decodeErr) {
					return EvolutionHistoryResult{}, AsPublicError(decodeErr)
				}
				genesis = true
				boundaryReached = true
			} else {
				changes, err = service.projectEvolutionDiff(ctx, parents[0], current)
				if err != nil {
					return EvolutionHistoryResult{}, err
				}
				changes = filterEvolutionChanges(changes, request.Scope, anchorIdentity)
				sort.Slice(changes, func(i, j int) bool { return changeKey(changes[i]) < changeKey(changes[j]) })
			}
		}

		start := 0
		if state == current {
			start = changeOffset
			if start, err = validatedChangeOffset(changes, start, lastKey, "History"); err != nil {
				return EvolutionHistoryResult{}, err
			}
		}
		if genesis {
			if lastKey == "" {
				items = append(items, HistoryEntry{State: current, Parents: parents, Change: nil})
			}
		} else if len(changes) == 0 && request.Scope == "all" {
			if lastKey == "" {
				items = append(items, HistoryEntry{State: current, Parents: parents, Change: nil})
			}
		} else {
			nextChangeOffset := start
			for index := start; index < len(changes) && len(items) < limit; index++ {
				change := changes[index]
				change.identity = ""
				items = append(items, HistoryEntry{State: current, Parents: parents, Change: &change})
				nextChangeOffset = index + 1
				lastKey = changeKey(changes[index])
			}
			if len(items) == limit && nextChangeOffset < len(changes) {
				state = current
				changeOffset = nextChangeOffset
				nativeCursor = nextNative
				break
			}
		}

		state = ""
		changeOffset = 0
		lastKey = ""
		nativeCursor = nextNative
		if nextNative == "" {
			break
		}
	}

	next := ""
	if !boundaryReached && (state != "" || nativeCursor != "") {
		anchorRef := ""
		if request.Object != nil {
			anchorRef = request.Object.AnchorState
		}
		next, err = encodeEvolutionCursor(evolutionCursor{
			Version: 1, Op: "history", RootRef: request.Root, Root: root, Scope: request.Scope,
			AnchorRef: anchorRef, Anchor: resolvedAnchor, Ref: filterRef, Native: nativeCursor,
			State: state, Offset: changeOffset, LastKey: lastKey,
		})
		if err != nil {
			return EvolutionHistoryResult{}, err
		}
	}
	return EvolutionHistoryResult{Root: root, Items: items, Cursor: next}, nil
}

func isConsistencyBoundary(err error) bool {
	return AsPublicError(err).Code == CodeConsistency
}

func (service *Service) requireHistoryAnchor(ctx context.Context, root, anchor string) error {
	if root == anchor {
		return nil
	}
	var cursor *string
	for {
		entries, err := service.database.Log(ctx, root, maxEvolutionLimit, cursor)
		if err != nil {
			return AsPublicError(err)
		}
		if len(entries) == 0 {
			break
		}
		for _, entry := range entries {
			if entry.Commit == anchor {
				return nil
			}
		}
		last := entries[len(entries)-1]
		if last.Cursor == nil {
			break
		}
		cursor = last.Cursor
	}
	return publicError(CodeInvalidArgument, "History object anchorState is not in root ancestry", nil)
}
