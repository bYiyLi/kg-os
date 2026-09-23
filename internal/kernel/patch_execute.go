package kernel

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func (service *Service) PatchOntology(ctx context.Context, request PatchRequest) (PatchResult, error) {
	if err := validateResolvedState(request.BaseState); err != nil {
		return PatchResult{}, err
	}
	if err := validateBranchName(request.Branch); err != nil {
		return PatchResult{}, err
	}
	if request.Patch == "" {
		return PatchResult{}, publicError(CodeParse, "patch is required", nil)
	}
	base, err := service.decodeSnapshot(ctx, request.BaseState)
	if err != nil {
		return PatchResult{}, err
	}
	currentHead, err := service.database.ResolveState(ctx, "branch/"+request.Branch)
	if err != nil {
		return PatchResult{}, AsPublicError(err)
	}
	if currentHead != request.BaseState {
		return PatchResult{}, publicError(CodeStaleBaseState, "target branch head no longer matches baseState", nil)
	}
	plan, err := planOntologyPatch(base, request.Patch)
	if err != nil {
		return PatchResult{}, err
	}
	noOp, err := plan.isNoOp()
	if err != nil {
		return PatchResult{}, err
	}
	if noOp {
		return plan.patchResult(request.BaseState), nil
	}
	if err := service.validateDataSafety(ctx, plan); err != nil {
		return PatchResult{}, err
	}

	baseConstraints, err := collectBaseConstraints(base)
	if err != nil {
		return PatchResult{}, err
	}
	targetConstraints, err := collectConstraintSpecs(plan.Objects)
	if err != nil {
		return PatchResult{}, err
	}
	baseIndexes, err := collectSnapshotIndexes(base)
	if err != nil {
		return PatchResult{}, err
	}
	targetIndexes, err := collectPlannedIndexes(plan)
	if err != nil {
		return PatchResult{}, err
	}
	if err := validateDerivedResourceMaintenance(
		plan,
		baseConstraints,
		targetConstraints,
		baseIndexes,
		targetIndexes,
	); err != nil {
		return PatchResult{}, err
	}
	if err := validateTargetIndexes(plan, targetIndexes); err != nil {
		return PatchResult{}, err
	}
	if err := validateConstraintIndexCoexistence(plan, targetConstraints, targetIndexes); err != nil {
		return PatchResult{}, err
	}
	baseGraphType := buildGraphType(plannedObjectsFromSnapshot(base))
	targetGraphType := buildGraphType(plan.Objects)

	options := map[string]any{"branch": request.Branch, "expectedHead": request.BaseState}
	if request.Author != nil {
		options["author"] = *request.Author
	}
	if request.Message != nil {
		options["message"] = *request.Message
	}
	transaction, err := service.database.Begin(ctx, options)
	if err != nil {
		return PatchResult{}, AsPublicError(err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = transaction.Close()
		}
	}()

	if err := applyKnowledgeRenameMaintenance(ctx, transaction, plan); err != nil {
		return PatchResult{}, err
	}
	if err := dropChangedIndexes(ctx, transaction, baseIndexes, targetIndexes); err != nil {
		return PatchResult{}, err
	}
	if err := dropChangedConstraints(ctx, transaction, baseConstraints, targetConstraints); err != nil {
		return PatchResult{}, err
	}
	if baseGraphType != targetGraphType {
		if _, err := transaction.Execute(ctx, "ALTER CURRENT GRAPH TYPE SET "+targetGraphType, nil, nil); err != nil {
			return PatchResult{}, AsPublicError(err)
		}
	}
	if err := removeRenamedSourceDefinitionLabels(ctx, transaction, plan); err != nil {
		return PatchResult{}, err
	}
	if err := removeRenamedSourceProperties(ctx, transaction, plan); err != nil {
		return PatchResult{}, err
	}
	if err := createChangedConstraints(ctx, transaction, baseConstraints, targetConstraints); err != nil {
		return PatchResult{}, err
	}
	if err := createChangedIndexes(
		ctx,
		transaction,
		baseIndexes,
		targetIndexes,
		service.fullTextAnalyzer,
		service.semantic.IndexOptions(),
	); err != nil {
		return PatchResult{}, err
	}
	if err := syncInternalGraph(ctx, transaction, plan); err != nil {
		return PatchResult{}, err
	}
	if err := validateStagedInternalGraph(ctx, transaction, plan); err != nil {
		return PatchResult{}, err
	}
	if err := validateStagedSnapshot(ctx, transaction, request.BaseState, plan); err != nil {
		return PatchResult{}, err
	}

	rawCommit, err := transaction.Commit(ctx)
	if err != nil {
		return PatchResult{}, AsPublicError(err)
	}
	committed = true
	state, err := commitState(rawCommit)
	if err != nil {
		return PatchResult{}, err
	}
	return plan.patchResult(state), nil
}

func plannedObjectsFromSnapshot(base *snapshot) map[OntologyRef]*plannedObject {
	result := map[OntologyRef]*plannedObject{}
	for name, record := range base.Domains {
		ref := OntologyRef{Kind: KindDomain, Name: name}
		value := cloneDomain(record.Value)
		result[ref] = &plannedObject{Value: ObjectValue{Kind: KindDomain, Domain: &value}}
	}
	for ref, record := range base.Definitions {
		value := cloneDefinition(record.Value)
		result[ref] = &plannedObject{Value: ObjectValue{Kind: ref.Kind, Definition: &value}}
	}
	return result
}

func dropChangedIndexes(
	ctx context.Context,
	transaction *lithograph.Transaction,
	base map[string]logicalIndex,
	target map[string]logicalIndex,
) error {
	names := make([]string, 0, len(base))
	for name := range base {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		targetIndex, exists := target[name]
		if exists && equalLogicalIndex(base[name], targetIndex, true) {
			continue
		}
		if _, err := transaction.Execute(ctx, dropIndexCypher(name), nil, nil); err != nil {
			return AsPublicError(err)
		}
	}
	return nil
}

func dropChangedConstraints(
	ctx context.Context,
	transaction *lithograph.Transaction,
	base map[string]constraintSpec,
	target map[string]constraintSpec,
) error {
	names := make([]string, 0, len(base))
	for name := range base {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		targetConstraint, exists := target[name]
		if exists && equalConstraintSpec(base[name], targetConstraint) {
			continue
		}
		if _, err := transaction.Execute(ctx, dropConstraintCypher(name), nil, nil); err != nil {
			return AsPublicError(err)
		}
	}
	return nil
}

func createChangedConstraints(
	ctx context.Context,
	transaction *lithograph.Transaction,
	base map[string]constraintSpec,
	target map[string]constraintSpec,
) error {
	names := make([]string, 0, len(target))
	for name := range target {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		baseConstraint, exists := base[name]
		if exists && equalConstraintSpec(baseConstraint, target[name]) {
			continue
		}
		cypher, err := createConstraintCypher(target[name])
		if err != nil {
			return err
		}
		if _, err := transaction.Execute(ctx, cypher, nil, nil); err != nil {
			return AsPublicError(err)
		}
	}
	return nil
}

func createChangedIndexes(
	ctx context.Context,
	transaction *lithograph.Transaction,
	base map[string]logicalIndex,
	target map[string]logicalIndex,
	analyzer string,
	semantic map[string]any,
) error {
	names := make([]string, 0, len(target))
	for name := range target {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		baseIndex, exists := base[name]
		if exists && equalLogicalIndex(baseIndex, target[name], true) {
			continue
		}
		cypher, params, err := createIndexCypher(target[name], analyzer, semantic)
		if err != nil {
			return err
		}
		if _, err := transaction.Execute(ctx, cypher, params, nil); err != nil {
			return AsPublicError(err)
		}
	}
	return nil
}

func validateTargetIndexes(plan *plannedState, indexes map[string]logicalIndex) error {
	for name, index := range indexes {
		if len(index.Targets) == 0 {
			return errorWithDetails(CodeType, "Index has no target", map[string]any{"name": name})
		}
		kind := index.Targets[0].Kind
		for _, target := range index.Targets {
			if target.Kind != kind {
				return errorWithDetails(CodeType, "shared Index targets must have the same Definition kind", map[string]any{"name": name})
			}
			object := plan.Objects[target]
			if object == nil || object.Value.Definition == nil {
				return errorWithDetails(CodeObjectConflict, "Index target Definition is missing", map[string]any{"name": name, "target": target.String()})
			}
			for _, property := range index.Properties {
				stored := findProperty(object.Value.Definition.Properties, property)
				if stored == nil {
					return errorWithDetails(CodeObjectConflict, "Index source Property is missing", map[string]any{"name": name, "target": target.String(), "property": property})
				}
				if (index.Type == "fulltext" || index.Type == "vector") && stored.Type != "STRING" {
					return errorWithDetails(CodeType, "search Index source Property must be STRING", map[string]any{"name": name, "property": property})
				}
			}
		}
		if (index.Type == "range" || index.Type == "text" || index.Type == "point") && len(index.Targets) != 1 {
			return errorWithDetails(CodeType, "standard Index cannot span Definitions", map[string]any{"name": name})
		}
		if index.Type == "vector" && len(index.Properties) != 1 {
			return errorWithDetails(CodeType, "Semantic Index requires exactly one source Property", map[string]any{"name": name})
		}
	}
	return nil
}

func validateStagedInternalGraph(
	ctx context.Context,
	transaction *lithograph.Transaction,
	plan *plannedState,
) error {
	expectedDomains := 0
	expectedDefinitions := 0
	expectedProperties := 0
	expectedIncludes := 0
	for _, object := range plan.Objects {
		if object.Value.Domain != nil {
			expectedDomains++
			expectedIncludes += len(object.Value.Domain.Includes)
		}
		if object.Value.Definition != nil {
			expectedDefinitions++
			expectedProperties += len(object.Value.Definition.Properties)
		}
	}
	checks := []struct {
		Name   string
		Cypher string
		Want   int64
	}{
		{"domains", "MATCH (n:" + domainLabel + ") RETURN count(n) AS count", int64(expectedDomains)},
		{"definitions", "MATCH (n:" + definitionBindingLabel + ") RETURN count(n) AS count", int64(expectedDefinitions)},
		{"properties", "MATCH (n:" + propertyBindingLabel + ") RETURN count(n) AS count", int64(expectedProperties)},
		{"property owners", "MATCH ()-[r:" + propertyOfType + "]->() RETURN count(r) AS count", int64(expectedProperties)},
		{"domain membership", "MATCH ()-[r:" + includesType + "]->() RETURN count(r) AS count", int64(expectedIncludes)},
	}
	for _, check := range checks {
		got, err := transactionCount(ctx, transaction, check.Cypher, nil)
		if err != nil {
			return err
		}
		if got != check.Want {
			return errorWithDetails(
				CodeConsistency,
				fmt.Sprintf(
					"staged internal Ontology %s failed cardinality validation: got %d want %d",
					check.Name,
					got,
					check.Want,
				),
				map[string]any{"got": got, "want": check.Want},
			)
		}
	}
	return nil
}

func transactionCount(
	ctx context.Context,
	transaction *lithograph.Transaction,
	cypher string,
	params map[string]any,
) (int64, error) {
	result, err := transaction.Execute(ctx, cypher, params, nil)
	if err != nil {
		return 0, AsPublicError(err)
	}
	rows, err := rowsByName(result)
	if err != nil {
		return 0, err
	}
	if len(rows) != 1 {
		return 0, publicError(CodeInternal, "unexpected staged count result", nil)
	}
	var count int64
	if err := json.Unmarshal(rows[0]["count"], &count); err != nil {
		return 0, publicError(CodeInternal, "decode staged count", err)
	}
	return count, nil
}

func commitState(raw []byte) (string, error) {
	var result struct {
		Commit string `json:"commit"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", publicError(CodeInternal, "decode Lithograph transaction commit", err)
	}
	if err := validateResolvedState(result.Commit); err != nil {
		return "", publicError(CodeInternal, "Lithograph transaction returned an invalid commit", err)
	}
	return result.Commit, nil
}

func (plan *plannedState) patchResult(state string) PatchResult {
	result := PatchResult{State: state, Created: []CreatedObject{}, Transitions: []RefTransition{}}
	for _, created := range plan.Aliases {
		result.Created = append(result.Created, created)
	}
	sort.Slice(result.Created, func(i, j int) bool {
		left := string(result.Created[i].Kind) + "\x00" + result.Created[i].Alias
		right := string(result.Created[j].Kind) + "\x00" + result.Created[j].Alias
		return left < right
	})
	for from, to := range plan.Transitions {
		result.Transitions = append(result.Transitions, RefTransition{From: from, To: to})
	}
	sort.Slice(result.Transitions, func(i, j int) bool {
		return result.Transitions[i].From < result.Transitions[j].From
	})
	return result
}
