package kernel

import (
	"context"
	"encoding/json"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func (service *Service) EvolutionMergeStart(
	ctx context.Context,
	request MergeStartRequest,
) (MergeSession, error) {
	if err := validateBranchName(request.Branch); err != nil {
		return MergeSession{}, err
	}
	if request.Source == "" {
		return MergeSession{}, publicError(CodeInvalidArgument, "merge source is required", nil)
	}
	if err := validateStateRef(request.Source); err != nil {
		return MergeSession{}, err
	}
	targetState, err := service.resolveValidEvolutionState(ctx, "branch/"+request.Branch)
	if err != nil {
		return MergeSession{}, err
	}
	sourceState, err := service.resolveValidEvolutionState(ctx, request.Source)
	if err != nil {
		return MergeSession{}, err
	}
	native, err := service.database.StartMerge(
		ctx,
		request.Branch,
		sourceState,
		targetState,
	)
	if err != nil {
		return MergeSession{}, mergePublicError(err)
	}
	if native.TargetBranch != request.Branch || native.Ours != targetState || native.Theirs != sourceState {
		return MergeSession{}, publicError(CodeInternal, "Lithograph Merge Session did not preserve pinned State inputs", nil)
	}
	return publicMergeSession(native), nil
}

func (service *Service) EvolutionMergeList(
	ctx context.Context,
	request MergeListRequest,
) (MergeListResult, error) {
	limit, err := evolutionLimit(request.Limit)
	if err != nil {
		return MergeListResult{}, err
	}
	var cursor *string
	if request.Cursor != "" {
		cursor = &request.Cursor
	}
	native, err := service.database.ListMerges(ctx, limit, cursor)
	if err != nil {
		return MergeListResult{}, mergePublicError(err)
	}
	result := MergeListResult{Items: make([]MergeSessionSummary, 0, len(native))}
	for _, item := range native {
		result.Items = append(result.Items, MergeSessionSummary{
			Session: item.Session, Branch: item.TargetBranch,
			TargetState: item.Ours, SourceState: item.Theirs, Revision: item.Revision,
		})
		if item.Cursor != nil {
			result.Cursor = *item.Cursor
		}
	}
	return result, nil
}

func (service *Service) EvolutionMergeGet(
	ctx context.Context,
	request MergeGetRequest,
) (MergeSession, error) {
	if err := validateMergeSessionToken(request.Session); err != nil {
		return MergeSession{}, err
	}
	native, err := service.database.GetMerge(ctx, request.Session)
	if err != nil {
		return MergeSession{}, mergePublicError(err)
	}
	return publicMergeSession(native), nil
}

func (service *Service) EvolutionMergeConflicts(
	ctx context.Context,
	request MergeConflictsRequest,
) (MergeConflictsResult, error) {
	if err := validateMergeSessionToken(request.Session); err != nil {
		return MergeConflictsResult{}, err
	}
	limit, err := evolutionLimit(request.Limit)
	if err != nil {
		return MergeConflictsResult{}, err
	}
	var cursor *string
	if request.Cursor != "" {
		cursor = &request.Cursor
	}
	page, err := service.database.MergeConflicts(ctx, request.Session, limit, cursor)
	if err != nil {
		return MergeConflictsResult{}, mergePublicError(err)
	}
	oursSnapshot, theirsSnapshot, err := service.validateMergePinnedStates(ctx, page.Ours, page.Theirs)
	if err != nil {
		return MergeConflictsResult{}, err
	}
	items := make([]MergeConflict, 0, len(page.Items))
	for _, native := range page.Items {
		projection, projectErr := service.projectMergeConflict(
			ctx,
			native,
			page.Ours,
			page.Theirs,
			oursSnapshot,
			theirsSnapshot,
		)
		if projectErr != nil {
			return MergeConflictsResult{}, projectErr
		}
		items = append(items, projection.Public)
	}
	result := MergeConflictsResult{Session: page.Session, Revision: page.Revision, Items: items}
	if page.Cursor != nil {
		result.Cursor = *page.Cursor
	}
	return result, nil
}

func (service *Service) EvolutionMergeResolve(
	ctx context.Context,
	request MergeResolveRequest,
) (MergeSession, error) {
	if err := validateMergeSessionToken(request.Session); err != nil {
		return MergeSession{}, err
	}
	if err := validateExpectedMergeRevision(request.ExpectedRevision); err != nil {
		return MergeSession{}, err
	}
	if request.Resolutions == nil {
		return MergeSession{}, publicError(CodeInvalidArgument, "merge resolutions must be a JSON array", nil)
	}
	seen := make(map[string]struct{}, len(request.Resolutions))
	for _, resolution := range request.Resolutions {
		if resolution.ConflictID == "" {
			return MergeSession{}, publicError(CodeInvalidArgument, "merge resolution conflictId is required", nil)
		}
		if _, duplicate := seen[resolution.ConflictID]; duplicate {
			return MergeSession{}, publicError(CodeInvalidArgument, "duplicate merge resolution conflictId", nil)
		}
		seen[resolution.ConflictID] = struct{}{}
		if err := validatePublicMergeResolution(resolution); err != nil {
			return MergeSession{}, err
		}
	}

	pinned, err := service.database.GetMerge(ctx, request.Session)
	if err != nil {
		return MergeSession{}, mergePublicError(err)
	}
	if pinned.Revision != request.ExpectedRevision {
		return MergeSession{}, publicError(CodeMergeSessionChanged, "Merge Session revision changed", nil)
	}
	oursSnapshot, theirsSnapshot, err := service.validateMergePinnedStates(ctx, pinned.Ours, pinned.Theirs)
	if err != nil {
		return MergeSession{}, err
	}
	projections, err := service.loadMergeConflictProjections(
		ctx,
		request.Session,
		request.ExpectedRevision,
		pinned.Ours,
		pinned.Theirs,
		oursSnapshot,
		theirsSnapshot,
		seen,
	)
	if err != nil {
		return MergeSession{}, err
	}
	native := make([]lithograph.MergeResolution, 0, len(request.Resolutions))
	for _, resolution := range request.Resolutions {
		projection, ok := projections[resolution.ConflictID]
		if !ok {
			return MergeSession{}, publicError(CodeInvalidArgument, "unknown merge resolution conflictId", nil)
		}
		item := lithograph.MergeResolution{ConflictID: resolution.ConflictID, Choice: resolution.Choice}
		if resolution.Choice == "value" {
			mapped, mapErr := projection.ToNative(resolution.Value)
			if mapErr != nil {
				return MergeSession{}, mapErr
			}
			item.Value = mapped
			item.HasValue = true
		}
		native = append(native, item)
	}
	updated, err := service.database.ResolveMerge(
		ctx,
		request.Session,
		request.ExpectedRevision,
		native,
	)
	if err != nil {
		return MergeSession{}, mergePublicError(err)
	}
	if updated.Session != request.Session {
		return MergeSession{}, publicError(CodeInternal, "Lithograph merge.resolve returned a different Session", nil)
	}
	return MergeSession{
		Session: request.Session, Branch: pinned.TargetBranch,
		TargetState: pinned.Ours, SourceState: pinned.Theirs,
		Revision: updated.Revision, Status: updated.Status, Unresolved: updated.Unresolved,
	}, nil
}

func (service *Service) EvolutionMergeFinalize(
	ctx context.Context,
	request MergeFinalizeRequest,
) (MergeFinalizeResult, error) {
	if err := validateMergeSessionToken(request.Session); err != nil {
		return MergeFinalizeResult{}, err
	}
	if err := validateExpectedMergeRevision(request.ExpectedRevision); err != nil {
		return MergeFinalizeResult{}, err
	}
	pinned, err := service.database.GetMerge(ctx, request.Session)
	if err != nil {
		return MergeFinalizeResult{}, mergePublicError(err)
	}
	if pinned.Revision != request.ExpectedRevision {
		return MergeFinalizeResult{}, publicError(CodeMergeSessionChanged, "Merge Session revision changed", nil)
	}
	if _, _, err := service.validateMergePinnedStates(ctx, pinned.Ours, pinned.Theirs); err != nil {
		return MergeFinalizeResult{}, err
	}
	if pinned.Unresolved != 0 {
		return MergeFinalizeResult{}, publicError(CodeMergeConflict, "Merge Session still has unresolved conflicts", nil)
	}
	if _, err := service.decodeMergeCandidateSnapshot(ctx, request.Session, request.ExpectedRevision); err != nil {
		return MergeFinalizeResult{}, sanitizedConsistencyError(err)
	}
	finalized, err := service.database.FinalizeMerge(
		ctx,
		request.Session,
		request.ExpectedRevision,
		request.Author,
		request.Message,
	)
	if err != nil {
		return MergeFinalizeResult{}, mergePublicError(err)
	}
	return MergeFinalizeResult{
		Status: finalized.Status, TargetState: pinned.Ours,
		SourceState: pinned.Theirs, State: finalized.Commit,
	}, nil
}

func (service *Service) EvolutionMergeAbort(
	ctx context.Context,
	request MergeAbortRequest,
) (MergeAbortResult, error) {
	if err := validateMergeSessionToken(request.Session); err != nil {
		return MergeAbortResult{}, err
	}
	if err := validateExpectedMergeRevision(request.ExpectedRevision); err != nil {
		return MergeAbortResult{}, err
	}
	session, err := service.database.AbortMerge(ctx, request.Session, request.ExpectedRevision)
	if err != nil {
		return MergeAbortResult{}, mergePublicError(err)
	}
	return MergeAbortResult{Session: session}, nil
}

func (service *Service) validateMergePinnedStates(
	ctx context.Context,
	ours string,
	theirs string,
) (*snapshot, *snapshot, error) {
	oursSnapshot, err := service.decodeResolvedSnapshot(ctx, ours)
	if err != nil {
		return nil, nil, sanitizedConsistencyError(err)
	}
	theirsSnapshot, err := service.decodeResolvedSnapshot(ctx, theirs)
	if err != nil {
		return nil, nil, sanitizedConsistencyError(err)
	}
	return oursSnapshot, theirsSnapshot, nil
}

func publicMergeSession(native lithograph.MergeSession) MergeSession {
	return MergeSession{
		Session: native.Session, Branch: native.TargetBranch,
		TargetState: native.Ours, SourceState: native.Theirs,
		Revision: native.Revision, Status: native.Status, Unresolved: native.Unresolved,
	}
}

func validateMergeSessionToken(session string) error {
	if session == "" {
		return publicError(CodeInvalidArgument, "merge session is required", nil)
	}
	return nil
}

func validateExpectedMergeRevision(revision int64) error {
	if revision < 1 {
		return publicError(CodeInvalidArgument, "expectedRevision must be a positive integer", nil)
	}
	return nil
}

func validatePublicMergeResolution(resolution MergeResolution) error {
	switch resolution.Choice {
	case "ours", "theirs":
		if len(resolution.Value) != 0 {
			return publicError(CodeInvalidArgument, "ours/theirs merge resolution cannot contain value", nil)
		}
	case "value":
		if len(resolution.Value) == 0 || !json.Valid(resolution.Value) {
			return publicError(CodeInvalidArgument, "value merge resolution requires one valid JSON value", nil)
		}
	default:
		return publicError(CodeInvalidArgument, "merge resolution choice must be ours, theirs, or value", nil)
	}
	return nil
}

func mergePublicError(err error) *PublicError {
	return graphPublicError(err)
}

func unsafeMergeProjectionError() error {
	return publicError(CodeConsistency, "Merge conflict cannot be represented safely by the KG OS public model", nil)
}

func unsafeMergeResolutionValueError() error {
	return publicError(
		CodeConsistency,
		"Merge conflict cannot be mapped safely from the public resolution value",
		nil,
	)
}
