# OntologyReadResult

Ontology results resolved from the same immutable State.

```ts
export interface OntologyReadResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Requested Ontology views, Domain summaries or Definition views at the same State. */
  results: OntologyReadItem[];
}
```

## Fields

| Name      | Type                 | Notes                                                                               |
| --------- | -------------------- | ----------------------------------------------------------------------------------- |
| `state`   | `ResolvedState`      | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |
| `results` | `OntologyReadItem[]` | Requested Ontology views, Domain summaries or Definition views at the same State.   |

## Related types

- `docs.read('sdk/types/OntologyReadItem.md')`
- `docs.read('sdk/types/ResolvedState.md')`
