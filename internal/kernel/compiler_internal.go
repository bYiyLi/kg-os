package kernel

import (
	"context"
	"sort"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func syncInternalGraph(
	ctx context.Context,
	transaction *lithograph.Transaction,
	plan *plannedState,
) error {
	if _, err := transaction.Execute(ctx,
		"MATCH (d:"+domainLabel+")-[r:"+includesType+"]->() DELETE r FINISH",
		nil, nil,
	); err != nil {
		return AsPublicError(err)
	}

	retained := map[string]struct{}{}
	domainIDs := map[OntologyRef]string{}
	definitionIDs := map[OntologyRef]string{}
	refs := plan.sortedObjects()
	for _, ref := range refs {
		object := plan.Objects[ref]
		if object.BaseRef == nil {
			continue
		}
		switch ref.Kind {
		case KindDomain:
			baseRecord := plan.Base.Domains[object.BaseRef.Name]
			if baseRecord == nil {
				return publicError(CodeConsistency, "Domain continuity record is missing", nil)
			}
			retained[baseRecord.ElementID] = struct{}{}
			domainIDs[ref] = baseRecord.ElementID
			if err := updateInternalNode(ctx, transaction, baseRecord.ElementID, "", object.Value.Domain.Name,
				object.Value.Domain.Title, object.Value.Domain.Description); err != nil {
				return err
			}
		case KindNodeDefinition, KindRelationshipDefinition:
			baseRecord := plan.Base.Definitions[*object.BaseRef]
			if baseRecord == nil {
				return publicError(CodeConsistency, "Definition continuity record is missing", nil)
			}
			retained[baseRecord.ElementID] = struct{}{}
			definitionIDs[ref] = baseRecord.ElementID
			kind := "node"
			if ref.Kind == KindRelationshipDefinition {
				kind = "relationship"
			}
			if err := updateInternalNode(ctx, transaction, baseRecord.ElementID, kind, object.Value.Definition.Name,
				object.Value.Definition.Title, object.Value.Definition.Description); err != nil {
				return err
			}
			for _, property := range object.Value.Definition.Properties {
				baseName := object.PropertyBase[property.Name]
				if baseName == "" {
					continue
				}
				id := baseRecord.PropertyElementIDs[baseName]
				if id == "" {
					return publicError(CodeConsistency, "Property continuity record is missing", nil)
				}
				retained[id] = struct{}{}
				if err := updateInternalNode(ctx, transaction, id, "", property.Name, property.Title, property.Description); err != nil {
					return err
				}
			}
		}
	}

	var removals []string
	for _, record := range plan.Base.Domains {
		if _, ok := retained[record.ElementID]; !ok {
			removals = append(removals, record.ElementID)
		}
	}
	for _, record := range plan.Base.Definitions {
		for _, id := range record.PropertyElementIDs {
			if _, ok := retained[id]; !ok {
				removals = append(removals, id)
			}
		}
		if _, ok := retained[record.ElementID]; !ok {
			removals = append(removals, record.ElementID)
		}
	}
	sort.Strings(removals)
	for _, id := range removals {
		if _, err := transaction.Execute(ctx,
			"MATCH (n) WHERE elementId(n) = $id DETACH DELETE n FINISH",
			map[string]any{"id": id}, nil,
		); err != nil {
			return AsPublicError(err)
		}
	}

	for _, ref := range refs {
		object := plan.Objects[ref]
		if object.BaseRef != nil {
			continue
		}
		if ref.Kind == KindDomain {
			id, err := createDomainBinding(ctx, transaction, *object.Value.Domain)
			if err != nil {
				return err
			}
			domainIDs[ref] = id
			continue
		}
		id, err := createDefinitionBinding(ctx, transaction, *object.Value.Definition)
		if err != nil {
			return err
		}
		definitionIDs[ref] = id
	}

	for _, ref := range refs {
		object := plan.Objects[ref]
		if object.Value.Definition == nil {
			continue
		}
		for _, property := range object.Value.Definition.Properties {
			if object.PropertyBase[property.Name] != "" {
				continue
			}
			ownerID := definitionIDs[ref]
			if ownerID == "" {
				return publicError(CodeConsistency, "Definition Binding identity is missing", nil)
			}
			if err := createPropertyBinding(ctx, transaction, ownerID, property); err != nil {
				return err
			}
		}
	}

	for _, ref := range refs {
		object := plan.Objects[ref]
		if object.Value.Domain == nil {
			continue
		}
		domainID := domainIDs[ref]
		if domainID == "" {
			return publicError(CodeConsistency, "Domain Binding identity is missing", nil)
		}
		for _, rawTarget := range object.Value.Domain.Includes {
			target, err := ParseOntologyRef(rawTarget)
			if err != nil {
				return err
			}
			targetID := ""
			if target.Kind == KindDomain {
				targetID = domainIDs[target]
			} else {
				targetID = definitionIDs[target]
			}
			if targetID == "" {
				return publicError(CodeConsistency, "Domain membership target Binding identity is missing", nil)
			}
			if err := createDomainMembership(ctx, transaction, domainID, targetID); err != nil {
				return err
			}
		}
	}
	return nil
}

func updateInternalNode(
	ctx context.Context,
	transaction *lithograph.Transaction,
	id string,
	kind string,
	name string,
	title *string,
	description *string,
) error {
	params := map[string]any{"id": id, "name": name, "title": title, "description": description}
	cypher := "MATCH (n) WHERE elementId(n) = $id SET n." + internalNameProperty +
		" = $name, n." + internalTitleProperty + " = $title, n." +
		internalDescriptionProperty + " = $description"
	if kind != "" {
		params["kind"] = kind
		cypher += ", n." + internalKindProperty + " = $kind"
	}
	cypher += " FINISH"
	if _, err := transaction.Execute(ctx, cypher, params, nil); err != nil {
		return AsPublicError(err)
	}
	return nil
}

func createDomainBinding(
	ctx context.Context,
	transaction *lithograph.Transaction,
	domain Domain,
) (string, error) {
	cypher := "CREATE (n:" + domainLabel + ":" + internalLabel +
		" {" + internalNameProperty + ": $name}) SET n." +
		internalTitleProperty + " = $title, n." +
		internalDescriptionProperty + " = $description RETURN elementId(n) AS id"
	result, err := transaction.Execute(ctx, cypher, map[string]any{
		"name": domain.Name, "title": domain.Title, "description": domain.Description,
	}, nil)
	if err != nil {
		return "", AsPublicError(err)
	}
	return createdInternalID(result, "Domain Binding")
}

func createDefinitionBinding(
	ctx context.Context,
	transaction *lithograph.Transaction,
	definition Definition,
) (string, error) {
	kind := "node"
	if definition.Kind == KindRelationshipDefinition {
		kind = "relationship"
	}
	cypher := "CREATE (n:" + definitionBindingLabel + ":" + internalLabel +
		" {" + internalKindProperty + ": $kind, " +
		internalNameProperty + ": $name}) SET n." +
		internalTitleProperty + " = $title, n." +
		internalDescriptionProperty + " = $description RETURN elementId(n) AS id"
	result, err := transaction.Execute(ctx, cypher, map[string]any{
		"kind": kind, "name": definition.Name, "title": definition.Title, "description": definition.Description,
	}, nil)
	if err != nil {
		return "", AsPublicError(err)
	}
	return createdInternalID(result, "Definition Binding")
}

func createPropertyBinding(
	ctx context.Context,
	transaction *lithograph.Transaction,
	ownerID string,
	property Property,
) error {
	cypher := "MATCH (d) WHERE elementId(d) = $ownerID " +
		"CREATE (p:" + propertyBindingLabel + ":" + internalLabel +
		" {" + internalNameProperty + ": $name})-[:" +
		propertyOfType + "]->(d) SET p." +
		internalTitleProperty + " = $title, p." +
		internalDescriptionProperty + " = $description RETURN elementId(p) AS id"
	result, err := transaction.Execute(ctx, cypher, map[string]any{
		"ownerID": ownerID, "name": property.Name,
		"title": property.Title, "description": property.Description,
	}, nil)
	if err != nil {
		return AsPublicError(err)
	}
	_, err = createdInternalID(result, "Property Binding")
	return err
}

func createDomainMembership(
	ctx context.Context,
	transaction *lithograph.Transaction,
	domainID string,
	targetID string,
) error {
	cypher := "MATCH (d), (t) WHERE elementId(d) = $domainID AND elementId(t) = $targetID " +
		"CREATE (d)-[r:" + includesType + "]->(t) RETURN elementId(r) AS id"
	result, err := transaction.Execute(ctx, cypher, map[string]any{
		"domainID": domainID, "targetID": targetID,
	}, nil)
	if err != nil {
		return AsPublicError(err)
	}
	_, err = createdInternalID(result, "Domain membership")
	return err
}

func createdInternalID(result lithograph.Result, resource string) (string, error) {
	rows, err := rowsByName(result)
	if err != nil {
		return "", err
	}
	if len(rows) != 1 {
		return "", errorWithDetails(
			CodeConsistency,
			resource+" creation did not produce exactly one internal element",
			map[string]any{"rows": len(rows)},
		)
	}
	id, err := rawString(rows[0], "id")
	if err != nil {
		return "", err
	}
	if id == "" {
		return "", publicError(CodeConsistency, resource+" creation returned an empty element identity", nil)
	}
	return id, nil
}
