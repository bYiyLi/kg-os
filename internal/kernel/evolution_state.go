package kernel

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

const defaultEvolutionBranch = "main"

type evolutionCursor struct {
	Version   int    `json:"v"`
	Op        string `json:"op"`
	RootRef   string `json:"rootRef,omitempty"`
	Root      string `json:"root,omitempty"`
	BeforeRef string `json:"beforeRef,omitempty"`
	Before    string `json:"before,omitempty"`
	AfterRef  string `json:"afterRef,omitempty"`
	After     string `json:"after,omitempty"`
	Scope     string `json:"scope,omitempty"`
	AnchorRef string `json:"anchorRef,omitempty"`
	Anchor    string `json:"anchor,omitempty"`
	Ref       string `json:"ref,omitempty"`
	Native    string `json:"native,omitempty"`
	State     string `json:"state,omitempty"`
	Offset    int    `json:"offset,omitempty"`
	LastKey   string `json:"lastKey,omitempty"`
}

func (service *Service) EvolutionOverview(ctx context.Context) (EvolutionOverviewResult, error) {
	state, err := service.database.ResolveState(ctx, "branch/"+defaultEvolutionBranch)
	if err != nil {
		return EvolutionOverviewResult{}, AsPublicError(err)
	}
	return EvolutionOverviewResult{DefaultBranch: defaultEvolutionBranch, State: state}, nil
}

func (service *Service) EvolutionGet(ctx context.Context, request EvolutionGetRequest) (EvolutionGetResult, error) {
	state, err := service.resolveEvolutionState(ctx, request.State)
	if err != nil {
		return EvolutionGetResult{}, err
	}
	commit, err := service.database.GetCommit(ctx, state)
	if err != nil {
		return EvolutionGetResult{}, AsPublicError(err)
	}
	consistency, err := service.consistencyStatus(ctx, state)
	if err != nil {
		return EvolutionGetResult{}, err
	}
	result := EvolutionGetResult{
		State: state, Parents: append([]string(nil), commit.Parents...),
		Author: commit.Author, Message: commit.Message, CommittedAt: commit.CommittedAt,
		Consistency: consistency, HasData: commit.HasData,
	}
	if commit.HasData {
		result.Data = append(json.RawMessage(nil), commit.Data...)
	} else {
		result.Data = json.RawMessage("null")
	}
	return result, nil
}

func (service *Service) EvolutionAncestry(ctx context.Context, request EvolutionAncestryRequest) (EvolutionAncestryResult, error) {
	limit, err := evolutionLimit(request.Limit)
	if err != nil {
		return EvolutionAncestryResult{}, err
	}
	if err := validateStateRef(request.Root); err != nil {
		return EvolutionAncestryResult{}, err
	}
	root := ""
	var native *string
	if request.Cursor != "" {
		cursor, decodeErr := decodeEvolutionCursor(request.Cursor)
		if decodeErr != nil {
			return EvolutionAncestryResult{}, decodeErr
		}
		if cursor.Op != "ancestry" || cursor.RootRef != request.Root || cursor.Root == "" || cursor.Native == "" {
			return EvolutionAncestryResult{}, publicError(CodeInvalidArgument, "cursor does not match ancestry root", nil)
		}
		root = cursor.Root
		native = &cursor.Native
	} else {
		root, err = service.resolveEvolutionState(ctx, request.Root)
		if err != nil {
			return EvolutionAncestryResult{}, err
		}
	}
	entries, err := service.database.Log(ctx, root, limit, native)
	if err != nil {
		return EvolutionAncestryResult{}, AsPublicError(err)
	}
	items := make([]StateSummary, 0, len(entries))
	for _, entry := range entries {
		items = append(items, stateSummaryFromLog(entry))
	}
	next := ""
	if len(entries) > 0 && entries[len(entries)-1].Cursor != nil {
		next, err = encodeEvolutionCursor(evolutionCursor{
			Version: 1, Op: "ancestry", RootRef: request.Root, Root: root,
			Native: *entries[len(entries)-1].Cursor,
		})
		if err != nil {
			return EvolutionAncestryResult{}, err
		}
	}
	return EvolutionAncestryResult{Root: root, Items: items, Cursor: next}, nil
}

func (service *Service) EvolutionStateCreate(ctx context.Context, request StateCreateRequest) (StateCreateResult, error) {
	if err := validateRefName(request.Branch, "Branch"); err != nil {
		return StateCreateResult{}, err
	}
	parent, err := service.resolveEvolutionState(ctx, "branch/"+request.Branch)
	if err != nil {
		return StateCreateResult{}, err
	}
	if _, err := service.decodeResolvedSnapshot(ctx, parent); err != nil {
		return StateCreateResult{}, sanitizedConsistencyError(err)
	}
	var data *json.RawMessage
	if request.Data != nil {
		if !json.Valid(request.Data) {
			return StateCreateResult{}, publicError(CodeInvalidArgument, "data must be valid JSON", nil)
		}
		copyData := append(json.RawMessage(nil), request.Data...)
		data = &copyData
	}
	created, err := service.database.CreateCommit(
		ctx,
		request.Branch,
		parent,
		data,
		request.Author,
		request.Message,
	)
	if err != nil {
		if errors.Is(err, lithograph.ErrBranchHeadMoved) {
			return StateCreateResult{}, publicError(CodeBranchHeadMoved, "target Branch head changed after validation", err)
		}
		return StateCreateResult{}, AsPublicError(err)
	}
	return StateCreateResult{State: created}, nil
}

func (service *Service) EvolutionStateSetData(ctx context.Context, request StateSetDataRequest) (StateSetDataResult, error) {
	state, err := service.resolveEvolutionState(ctx, request.State)
	if err != nil {
		return StateSetDataResult{}, err
	}
	if request.Data == nil || !json.Valid(request.Data) {
		return StateSetDataResult{}, publicError(CodeInvalidArgument, "data must be valid JSON", nil)
	}
	data, err := service.database.SetCommitData(ctx, state, request.Data)
	if err != nil {
		return StateSetDataResult{}, AsPublicError(err)
	}
	return StateSetDataResult{State: state, Data: data}, nil
}

func (service *Service) EvolutionStateClearData(ctx context.Context, request StateClearDataRequest) (StateClearDataResult, error) {
	state, err := service.resolveEvolutionState(ctx, request.State)
	if err != nil {
		return StateClearDataResult{}, err
	}
	if err := service.database.ClearCommitData(ctx, state); err != nil {
		return StateClearDataResult{}, AsPublicError(err)
	}
	return StateClearDataResult{State: state}, nil
}

func (service *Service) EvolutionBranchList(ctx context.Context) (EvolutionRefListResult, error) {
	refs, err := service.database.ListBranches(ctx)
	if err != nil {
		return EvolutionRefListResult{}, AsPublicError(err)
	}
	return evolutionRefList(refs), nil
}

func (service *Service) EvolutionBranchCreate(ctx context.Context, request BranchCreateRequest) (BranchMutationResult, error) {
	if err := validateRefName(request.Name, "Branch"); err != nil {
		return BranchMutationResult{}, err
	}
	from, err := service.resolveValidEvolutionState(ctx, request.From)
	if err != nil {
		return BranchMutationResult{}, err
	}
	created, err := service.database.CreateBranch(ctx, request.Name, from)
	if err != nil {
		return BranchMutationResult{}, AsPublicError(err)
	}
	return BranchMutationResult{Name: created.Name, State: created.Commit}, nil
}

func (service *Service) EvolutionBranchDelete(ctx context.Context, request BranchDeleteRequest) (BranchMutationResult, error) {
	if err := validateRefName(request.Name, "Branch"); err != nil {
		return BranchMutationResult{}, err
	}
	deleted, err := service.database.DeleteBranch(ctx, request.Name)
	if err != nil {
		return BranchMutationResult{}, AsPublicError(err)
	}
	return BranchMutationResult{Name: deleted.Name, PreviousState: deleted.Commit}, nil
}

func (service *Service) EvolutionTagList(ctx context.Context) (EvolutionRefListResult, error) {
	refs, err := service.database.ListTags(ctx)
	if err != nil {
		return EvolutionRefListResult{}, AsPublicError(err)
	}
	return evolutionRefList(refs), nil
}

func (service *Service) EvolutionTagCreate(ctx context.Context, request TagCreateRequest) (TagMutationResult, error) {
	if err := validateRefName(request.Name, "Tag"); err != nil {
		return TagMutationResult{}, err
	}
	target, err := service.resolveValidEvolutionState(ctx, request.Target)
	if err != nil {
		return TagMutationResult{}, err
	}
	created, err := service.database.CreateTag(ctx, request.Name, target)
	if err != nil {
		return TagMutationResult{}, AsPublicError(err)
	}
	return TagMutationResult{Name: created.Name, State: created.Commit}, nil
}

func (service *Service) EvolutionTagMove(ctx context.Context, request TagMoveRequest) (TagMutationResult, error) {
	if err := validateRefName(request.Name, "Tag"); err != nil {
		return TagMutationResult{}, err
	}
	target, err := service.resolveValidEvolutionState(ctx, request.Target)
	if err != nil {
		return TagMutationResult{}, err
	}
	moved, previous, err := service.database.MoveTag(ctx, request.Name, target)
	if err != nil {
		return TagMutationResult{}, AsPublicError(err)
	}
	return TagMutationResult{Name: moved.Name, State: moved.Commit, PreviousState: previous}, nil
}

func (service *Service) EvolutionTagDelete(ctx context.Context, request TagDeleteRequest) (TagMutationResult, error) {
	if err := validateRefName(request.Name, "Tag"); err != nil {
		return TagMutationResult{}, err
	}
	deleted, err := service.database.DeleteTag(ctx, request.Name)
	if err != nil {
		return TagMutationResult{}, AsPublicError(err)
	}
	return TagMutationResult{Name: deleted.Name, PreviousState: deleted.Commit}, nil
}

func (service *Service) resolveValidEvolutionState(ctx context.Context, ref string) (string, error) {
	state, err := service.resolveEvolutionState(ctx, ref)
	if err != nil {
		return "", err
	}
	if _, err := service.decodeResolvedSnapshot(ctx, state); err != nil {
		return "", sanitizedConsistencyError(err)
	}
	return state, nil
}

func (service *Service) resolveEvolutionState(ctx context.Context, ref string) (string, error) {
	if err := validateStateRef(ref); err != nil {
		return "", err
	}
	state, err := service.database.ResolveState(ctx, ref)
	if err != nil {
		return "", AsPublicError(err)
	}
	return state, nil
}

func (service *Service) consistencyStatus(ctx context.Context, state string) (ConsistencyStatus, error) {
	_, err := service.decodeResolvedSnapshot(ctx, state)
	if err == nil {
		return ConsistencyStatus{Status: "valid", Issues: []ConsistencyIssue{}}, nil
	}
	return consistencyStatusFromError(err)
}

func consistencyStatusFromError(err error) (ConsistencyStatus, error) {
	public := AsPublicError(err)
	if public.Code != CodeConsistency {
		return ConsistencyStatus{}, public
	}
	return ConsistencyStatus{
		Status: "invalid",
		Issues: []ConsistencyIssue{{Code: consistencyIssueCode(err), Message: consistencyIssueMessage(err)}},
	}, nil
}

func consistencyIssueCode(err error) string {
	if issue, ok := markedConsistencyIssue(err); ok {
		return issue
	}
	return "RESERVED_SCHEMA_INVALID"
}

func consistencyIssueMessage(err error) string {
	switch consistencyIssueCode(err) {
	case "BINDING_MISSING":
		return "Ontology binding coverage is incomplete"
	case "BINDING_DUPLICATE":
		return "Ontology binding identity is duplicated"
	case "BINDING_DANGLING":
		return "Ontology binding target cannot be resolved"
	case "BINDING_KIND_MISMATCH":
		return "Ontology binding kind does not match its public Schema target"
	default:
		return "Reserved KG OS Schema is invalid"
	}
}

func sanitizedConsistencyError(err error) error {
	if AsPublicError(err).Code != CodeConsistency {
		return err
	}
	issue := consistencyIssueCode(err)
	return errorWithDetails(CodeConsistency, "State is not KG OS-consistent", map[string]any{"issue": issue})
}

func evolutionRefList(refs []lithograph.VersionRef) EvolutionRefListResult {
	items := make([]EvolutionRefItem, 0, len(refs))
	for _, ref := range refs {
		items = append(items, EvolutionRefItem{Name: ref.Name, State: ref.Commit})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
	return EvolutionRefListResult{Items: items}
}

func stateSummaryFromLog(entry lithograph.LogEntry) StateSummary {
	return StateSummary{
		State: entry.Commit, Parents: append([]string(nil), entry.Parents...), Author: entry.Author,
		Message: entry.Message, CommittedAt: entry.CommittedAt,
	}
}

func evolutionLimit(value int) (int, error) {
	if value == 0 {
		return defaultEvolutionLimit, nil
	}
	if value < 1 || value > maxEvolutionLimit {
		return 0, publicError(CodeInvalidArgument, "limit must be between 1 and 1000", nil)
	}
	return value, nil
}

func validateStateRef(ref string) error {
	switch {
	case strings.HasPrefix(ref, "commit/"):
		if len(ref) != len("commit/")+64 {
			return publicError(CodeInvalidArgument, "invalid StateRef", nil)
		}
		for _, char := range ref[len("commit/"):] {
			if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
				return publicError(CodeInvalidArgument, "invalid StateRef", nil)
			}
		}
		return nil
	case strings.HasPrefix(ref, "branch/"):
		return validateRefName(strings.TrimPrefix(ref, "branch/"), "Branch")
	case strings.HasPrefix(ref, "tag/"):
		return validateRefName(strings.TrimPrefix(ref, "tag/"), "Tag")
	default:
		return publicError(CodeInvalidArgument, "invalid StateRef", nil)
	}
}

func validateRefName(name, kind string) error {
	if !utf8.ValidString(name) {
		return publicError(CodeInvalidArgument, "invalid "+kind+" name", nil)
	}
	bytes := []byte(name)
	if len(bytes) < 1 || len(bytes) > 255 {
		return publicError(CodeInvalidArgument, "invalid "+kind+" name", nil)
	}
	for _, value := range bytes {
		if value == 0 || value < 0x20 || value == 0x7f {
			return publicError(CodeInvalidArgument, "invalid "+kind+" name", nil)
		}
	}
	if strings.HasPrefix(name, "/") || strings.HasSuffix(name, "/") {
		return publicError(CodeInvalidArgument, "invalid "+kind+" name", nil)
	}
	for _, segment := range strings.Split(name, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return publicError(CodeInvalidArgument, "invalid "+kind+" name", nil)
		}
	}
	return nil
}

func validateEvolutionScope(scope string, object *EvolutionObjectFilter) error {
	switch scope {
	case "all", "ontology", "knowledge":
		if object != nil {
			return publicError(CodeInvalidArgument, "object filter is valid only for scope=object", nil)
		}
	case "object":
		if object == nil || object.AnchorState == "" || object.Ref == "" {
			return publicError(CodeInvalidArgument, "scope=object requires anchorState and ref", nil)
		}
		if _, err := ParseObjectRef(object.Ref); err != nil {
			return err
		}
	default:
		return publicError(CodeInvalidArgument, "scope must be all, ontology, knowledge, or object", nil)
	}
	return nil
}

func encodeEvolutionCursor(cursor evolutionCursor) (string, error) {
	body, err := json.Marshal(cursor)
	if err != nil {
		return "", publicError(CodeInternal, "encode Evolution cursor", err)
	}
	return base64.RawURLEncoding.EncodeToString(body), nil
}

func decodeEvolutionCursor(raw string) (evolutionCursor, error) {
	body, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return evolutionCursor{}, publicError(CodeInvalidArgument, "invalid Evolution cursor", err)
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	var cursor evolutionCursor
	if err := decoder.Decode(&cursor); err != nil || cursor.Version != 1 || cursor.Op == "" {
		return evolutionCursor{}, publicError(CodeInvalidArgument, "invalid Evolution cursor", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return evolutionCursor{}, publicError(CodeInvalidArgument, "invalid Evolution cursor", err)
	}
	return cursor, nil
}

func changeKey(change Change) string {
	ref := change.BeforeRef
	if ref == "" {
		ref = change.AfterRef
	}
	primary := fmt.Sprintf("%s\x00%s\x00%s\x00%s", change.Kind, ref, change.Path, change.Change)
	public := change
	public.identity = ""
	body, err := json.Marshal(public)
	if err != nil {
		return primary
	}
	return primary + "\x00" + string(body)
}

func validatedChangeOffset(changes []Change, offset int, lastKey, operation string) (int, error) {
	if offset < 0 || offset > len(changes) {
		return 0, publicError(CodeInvalidArgument, "cursor does not match "+operation+" frontier", nil)
	}
	if offset == 0 {
		if lastKey != "" {
			return 0, publicError(CodeInvalidArgument, "cursor does not match "+operation+" frontier", nil)
		}
		return 0, nil
	}
	if lastKey == "" || changeKey(changes[offset-1]) != lastKey {
		return 0, publicError(CodeInvalidArgument, "cursor does not match "+operation+" frontier", nil)
	}
	return offset, nil
}
