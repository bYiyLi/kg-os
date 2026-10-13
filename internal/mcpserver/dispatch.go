package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
)

func publicCallError(err error) error {
	public := kernel.AsPublicError(err)
	details, _ := json.Marshal(public.Details)
	if len(details) > 1<<20 {
		details = nil
	}
	return &mcpsandbox.CallError{Code: string(public.Code), Message: public.Message, Details: details}
}

// Adapter owns SDK method-to-Kernel mapping. No daemon HTTP or TypeScript SDK
// roundtrip is involved. The sandbox enforces its own read-only method allowlist.
type Adapter struct{ Kernel *kernel.Service }

func call[Req, Res any](ctx context.Context, args []json.RawMessage, op func(context.Context, Req) (Res, error)) (json.RawMessage, error) {
	if len(args) != 1 {
		return nil, &mcpsandbox.CallError{Code: "INVALID_ARGUMENT", Message: fmt.Sprintf("Expected one SDK request, got %d", len(args))}
	}
	var req Req
	if err := json.Unmarshal(args[0], &req); err != nil {
		return nil, &mcpsandbox.CallError{Code: "INVALID_ARGUMENT", Message: "Invalid SDK request JSON"}
	}
	result, err := op(ctx, req)
	if err != nil {
		return nil, publicCallError(err)
	}
	return json.Marshal(result)
}
func noArgs[Res any](ctx context.Context, args []json.RawMessage, op func(context.Context) (Res, error)) (json.RawMessage, error) {
	if len(args) != 0 {
		return nil, &mcpsandbox.CallError{Code: "INVALID_ARGUMENT", Message: fmt.Sprintf("Expected no SDK arguments, got %d", len(args))}
	}
	result, err := op(ctx)
	if err != nil {
		return nil, publicCallError(err)
	}
	return json.Marshal(result)
}
func (a Adapter) Invoke(ctx context.Context, method string, args []json.RawMessage) (json.RawMessage, error) {
	k := a.Kernel
	switch method {
	case "ontology.read":
		return call(ctx, args, k.ReadOntology)
	case "ontology.patch":
		return call(ctx, args, k.PatchOntology)
	case "object.read":
		return call(ctx, args, k.ReadObjects)
	case "object.readText":
		return call(ctx, args, k.ReadObjectTexts)
	case "object.patch":
		return call(ctx, args, k.PatchObjects)
	case "graph.query":
		return call(ctx, args, k.QueryGraph)
	case "graph.execute":
		return call(ctx, args, k.ExecuteGraph)
	case "evolution.overview":
		return noArgs(ctx, args, k.EvolutionOverview)
	case "evolution.get":
		return call(ctx, args, k.EvolutionGet)
	case "evolution.ancestry":
		return call(ctx, args, k.EvolutionAncestry)
	case "evolution.history":
		return call(ctx, args, k.EvolutionHistory)
	case "evolution.diff":
		return call(ctx, args, k.EvolutionDiff)
	case "evolution.state.create":
		return call(ctx, args, k.EvolutionStateCreate)
	case "evolution.state.setData":
		return call(ctx, args, k.EvolutionStateSetData)
	case "evolution.state.clearData":
		return call(ctx, args, k.EvolutionStateClearData)
	case "evolution.branch.list":
		return noArgs(ctx, args, k.EvolutionBranchList)
	case "evolution.branch.create":
		return call(ctx, args, k.EvolutionBranchCreate)
	case "evolution.branch.delete":
		return call(ctx, args, k.EvolutionBranchDelete)
	case "evolution.tag.list":
		return noArgs(ctx, args, k.EvolutionTagList)
	case "evolution.tag.create":
		return call(ctx, args, k.EvolutionTagCreate)
	case "evolution.tag.move":
		return call(ctx, args, k.EvolutionTagMove)
	case "evolution.tag.delete":
		return call(ctx, args, k.EvolutionTagDelete)
	case "evolution.merge.list":
		return call(ctx, args, k.EvolutionMergeList)
	case "evolution.merge.get":
		return call(ctx, args, k.EvolutionMergeGet)
	case "evolution.merge.conflicts":
		return call(ctx, args, k.EvolutionMergeConflicts)
	case "evolution.merge.start":
		return call(ctx, args, k.EvolutionMergeStart)
	case "evolution.merge.resolve":
		return call(ctx, args, k.EvolutionMergeResolve)
	case "evolution.merge.finalize":
		return call(ctx, args, k.EvolutionMergeFinalize)
	case "evolution.merge.abort":
		return call(ctx, args, k.EvolutionMergeAbort)
	default:
		return nil, &mcpsandbox.CallError{Code: "PERMISSION_DENIED", Message: "SDK method unavailable"}
	}
}

func (a Adapter) Stream(ctx context.Context, method string, request json.RawMessage, emit func(json.RawMessage) error) error {
	callback := func(event kernel.GraphStreamEvent) error {
		raw, err := json.Marshal(event)
		if err != nil {
			return err
		}
		return emit(raw)
	}
	switch method {
	case "graph.streamQuery":
		var req kernel.GraphQueryRequest
		if err := json.Unmarshal(request, &req); err != nil {
			return &mcpsandbox.CallError{Code: "INVALID_ARGUMENT", Message: "Invalid Graph stream request"}
		}
		if err := a.Kernel.StreamGraphQuery(ctx, req, callback); err != nil {
			return publicCallError(err)
		}
		return nil
	case "graph.streamExecute":
		var req kernel.GraphExecuteRequest
		if err := json.Unmarshal(request, &req); err != nil {
			return &mcpsandbox.CallError{Code: "INVALID_ARGUMENT", Message: "Invalid Graph stream request"}
		}
		if err := a.Kernel.StreamGraphExecute(ctx, req, callback); err != nil {
			return publicCallError(err)
		}
		return nil
	default:
		return &mcpsandbox.CallError{Code: "PERMISSION_DENIED", Message: "SDK stream method unavailable"}
	}
}
