package kernel

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func (service *Service) bootstrapOrValidate(ctx context.Context) error {
	state, err := service.database.ResolveState(ctx, "branch/main")
	if err != nil {
		return AsPublicError(err)
	}
	if _, err := service.decodeSnapshot(ctx, state); err == nil {
		return nil
	} else if !isConsistencyError(err) {
		return err
	}
	fresh, err := service.isFreshRoot(ctx, state)
	if err != nil {
		return err
	}
	if !fresh {
		return errorWithDetails(
			CodeConsistency,
			"main is not a KG OS-valid State and the database is not an adoptable fresh Lithograph root",
			map[string]any{"state": state},
		)
	}
	return service.bootstrapFreshRoot(ctx, state)
}

func isConsistencyError(err error) bool {
	public := AsPublicError(err)
	return public.Code == CodeConsistency
}

func (service *Service) isFreshRoot(ctx context.Context, state string) (bool, error) {
	branches, err := service.database.QueryMetadata(ctx, "CALL lithograph.branch.list()", nil)
	if err != nil {
		return false, AsPublicError(err)
	}
	branchRows, err := rowsByName(branches)
	if err != nil {
		return false, err
	}
	if len(branchRows) != 1 {
		return false, nil
	}
	branchName, err := rawString(branchRows[0], "name")
	if err != nil || branchName != "main" {
		return false, err
	}
	branchCommit, err := rawString(branchRows[0], "commit")
	if err != nil || branchCommit != state {
		return false, err
	}

	tags, err := service.database.QueryMetadata(ctx, "CALL lithograph.tag.list()", nil)
	if err != nil {
		return false, AsPublicError(err)
	}
	if len(tags.Rows) != 0 {
		return false, nil
	}

	commit, err := service.database.QueryMetadata(
		ctx,
		"CALL lithograph.commit.get($state)",
		map[string]any{"state": state},
	)
	if err != nil {
		return false, AsPublicError(err)
	}
	commitRows, err := rowsByName(commit)
	if err != nil {
		return false, err
	}
	if len(commitRows) != 1 {
		return false, nil
	}
	parents, err := rawStringList(commitRows[0], "parents")
	if err != nil || len(parents) != 0 {
		return false, err
	}
	hasData, err := rawBool(commitRows[0], "hasData")
	if err != nil || hasData {
		return false, err
	}

	checks := []string{
		"SHOW CONSTRAINTS YIELD *",
		"SHOW INDEXES YIELD *",
		"MATCH (n) RETURN count(n) AS count",
	}
	for _, cypher := range checks {
		result, queryErr := service.database.Query(ctx, lithograph.QueryRequest{At: state, Cypher: cypher})
		if queryErr != nil {
			return false, AsPublicError(queryErr)
		}
		switch cypher {
		case "MATCH (n) RETURN count(n) AS count":
			if len(result.Result.Rows) != 1 {
				return false, publicError(CodeInternal, "unexpected node count result", nil)
			}
			rows, rowErr := rowsByName(result.Result)
			if rowErr != nil {
				return false, rowErr
			}
			var count int64
			if err := json.Unmarshal(rows[0]["count"], &count); err != nil {
				return false, publicError(CodeInternal, "decode Lithograph node count", err)
			}
			if count != 0 {
				return false, nil
			}
		default:
			if len(result.Result.Rows) != 0 {
				return false, nil
			}
		}
	}

	graph, err := service.database.Query(ctx, lithograph.QueryRequest{
		At:     state,
		Cypher: "SHOW CURRENT GRAPH TYPE AS GRAPH",
	})
	if err != nil {
		return false, AsPublicError(err)
	}
	graphRows, err := rowsByName(graph.Result)
	if err != nil {
		return false, err
	}
	if len(graphRows) != 1 {
		return false, nil
	}
	for _, name := range []string{"nodes", "relationships"} {
		var values []json.RawMessage
		if err := json.Unmarshal(graphRows[0][name], &values); err != nil {
			return false, publicError(CodeInternal, "decode fresh Graph Type "+name, err)
		}
		if len(values) != 0 {
			return false, nil
		}
	}
	return true, nil
}

func (service *Service) bootstrapFreshRoot(ctx context.Context, root string) (returnErr error) {
	transaction, err := service.database.Begin(ctx, map[string]any{
		"branch":       "main",
		"expectedHead": root,
	})
	if err != nil {
		return AsPublicError(err)
	}
	committed := false
	defer func() {
		if committed {
			return
		}
		if closeErr := transaction.Close(); closeErr != nil && returnErr == nil {
			returnErr = publicError(CodeInternal, "abort failed KG OS bootstrap", closeErr)
		}
	}()
	if _, err := transaction.Execute(
		ctx,
		"ALTER CURRENT GRAPH TYPE SET "+reservedGraphType,
		nil,
		nil,
	); err != nil {
		return AsPublicError(err)
	}
	if err := validateStagedSnapshot(ctx, transaction, root, nil); err != nil {
		return err
	}
	raw, err := transaction.Commit(ctx)
	if err != nil {
		return AsPublicError(err)
	}
	committed = true
	var result struct {
		Commit string `json:"commit"`
	}
	if err := json.Unmarshal(raw, &result); err != nil || !strings.HasPrefix(result.Commit, "commit/") {
		return publicError(CodeInternal, "decode KG OS bootstrap commit", err)
	}
	return nil
}
