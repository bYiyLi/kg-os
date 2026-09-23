package kernel

import (
	"context"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func validateStagedSnapshot(
	ctx context.Context,
	transaction *lithograph.Transaction,
	baseState string,
	expected *plannedState,
) error {
	graphResult, err := transaction.Execute(ctx, "SHOW CURRENT GRAPH TYPE AS GRAPH", nil, nil)
	if err != nil {
		return AsPublicError(err)
	}
	graphNodes, graphRelationships, err := decodeGraphTypeResult(graphResult)
	if err != nil {
		return err
	}
	definitions, nodeElementIDs, err := decodeDefinitions(graphNodes, graphRelationships)
	if err != nil {
		return err
	}
	if err := validateReservedGraphType(graphNodes, graphRelationships); err != nil {
		return err
	}

	internalNodesResult, err := transaction.Execute(
		ctx,
		"MATCH (n:"+internalLabel+") RETURN n",
		nil,
		nil,
	)
	if err != nil {
		return AsPublicError(err)
	}
	internalRelationshipResults := make([]lithograph.Result, 0, 2)
	for _, cypher := range []string{
		"MATCH (a:" + internalLabel + ")-[r]->(b) RETURN r",
		"MATCH (a)-[r]->(b:" + internalLabel + ") RETURN r",
	} {
		result, executeErr := transaction.Execute(ctx, cypher, nil, nil)
		if executeErr != nil {
			return AsPublicError(executeErr)
		}
		internalRelationshipResults = append(internalRelationshipResults, result)
	}
	internalNodes, internalRelationships, err := decodeInternalGraphResults(
		internalNodesResult,
		internalRelationshipResults,
	)
	if err != nil {
		return err
	}

	state := &snapshot{
		State:       baseState,
		Domains:     map[string]*domainRecord{},
		Definitions: definitions,
	}
	if err := bindInternalGraph(state, internalNodes, internalRelationships, nodeElementIDs); err != nil {
		return err
	}
	if err := decodeSchemaResourcesWithQuery(state, func(cypher string) (lithograph.Result, error) {
		result, queryErr := transaction.Execute(ctx, cypher, nil, nil)
		if queryErr != nil {
			return lithograph.Result{}, AsPublicError(queryErr)
		}
		return result, nil
	}); err != nil {
		return err
	}
	for _, record := range state.Definitions {
		value := ObjectValue{Kind: record.Value.Kind, Definition: &record.Value}
		if err := normalizeObject(value); err != nil {
			return errorWithDetails(
				CodeConsistency,
				"staged Definition is outside the KG OS Ontology profile",
				map[string]any{"definition": record.Value.Name, "cause": AsPublicError(err).Message},
			)
		}
	}
	for _, record := range state.Domains {
		value := ObjectValue{Kind: KindDomain, Domain: &record.Value}
		if err := normalizeObject(value); err != nil {
			return errorWithDetails(
				CodeConsistency,
				"staged Domain is outside the KG OS Ontology profile",
				map[string]any{"domain": record.Value.Name, "cause": AsPublicError(err).Message},
			)
		}
	}
	if expected != nil {
		if err := validatePlannedSnapshot(expected, state); err != nil {
			return err
		}
	}
	return nil
}

func validatePlannedSnapshot(plan *plannedState, staged *snapshot) error {
	if len(plan.Objects) != len(staged.Domains)+len(staged.Definitions) {
		return publicError(CodeConsistency, "staged Ontology object cardinality differs from the planned target", nil)
	}
	for ref, object := range plan.Objects {
		actual, err := staged.objectValue(ref)
		if err != nil {
			return errorWithDetails(
				CodeConsistency,
				"staged Ontology is missing a planned object",
				map[string]any{"ref": ref.String()},
			)
		}
		equal, err := CanonicalObjectEqual(object.Value, actual)
		if err != nil {
			return err
		}
		if !equal {
			return errorWithDetails(
				CodeConsistency,
				"staged Ontology object "+ref.String()+" differs from the planned target",
				map[string]any{"ref": ref.String()},
			)
		}
	}
	return nil
}
