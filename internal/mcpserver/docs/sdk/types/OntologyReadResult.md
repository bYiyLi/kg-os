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

- `sdk/types/OntologyReadItem.md`
- `sdk/types/ResolvedState.md`
