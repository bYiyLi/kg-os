# GraphQueryResult

Column-oriented schema and fully materialized Cypher rows at a resolved State.

```ts
export interface GraphQueryResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Column names in result order; each row uses the corresponding positions. */
  columns: string[];
  /** Materialized rows in column order; prefer streaming for large result sets. */
  rows: JsonValue[][];
}
```

## Fields

| Name      | Type            | Notes                                                                               |
| --------- | --------------- | ----------------------------------------------------------------------------------- |
| `state`   | `ResolvedState` | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |
| `columns` | `string[]`      | Column names in result order; each row uses the corresponding positions.            |
| `rows`    | `JsonValue[][]` | Materialized rows in column order; prefer streaming for large result sets.          |

## Related types

- `docs.read('sdk/types/JsonValue.md')`
- `docs.read('sdk/types/ResolvedState.md')`
