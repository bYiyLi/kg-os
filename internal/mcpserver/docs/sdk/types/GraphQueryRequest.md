# GraphQueryRequest

Execute unchanged Cypher against one immutable State using a read-only connection.

```ts
export interface GraphQueryRequest {
  /** StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>. */
  at: StateRef;
  /** Single Lithograph Cypher 25 query passed unchanged; never SQL SELECT lithograph(...) syntax. */
  cypher: string;
  /** Optional JSON-compatible named Cypher parameters, referenced as $name in the query. */
  params?: JsonObject;
  /** Select this Domain and all descendants' Node Definitions in the pinned State. Mutually exclusive with graphView. */
  domain?: string;
  /** Explicit query-local Label visibility. Mutually exclusive with domain; omitted means complete graph. */
  graphView?: GraphViewSelector;
}
```

## Fields

| Name         | Type                | Notes                                                                                                            |
| ------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `at`         | `StateRef`          | StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>.              |
| `cypher`     | `string`            | Single Lithograph Cypher 25 query passed unchanged; never SQL SELECT lithograph(...) syntax.                     |
| `params?`    | `JsonObject`        | Optional JSON-compatible named Cypher parameters, referenced as $name in the query.                              |
| `domain?`    | `string`            | Select this Domain and all descendants' Node Definitions in the pinned State. Mutually exclusive with graphView. |
| `graphView?` | `GraphViewSelector` | Explicit query-local Label visibility. Mutually exclusive with domain; omitted means complete graph.             |

## Related types

- `sdk/types/GraphViewSelector.md`
- `sdk/types/JsonObject.md`
- `sdk/types/StateRef.md`
