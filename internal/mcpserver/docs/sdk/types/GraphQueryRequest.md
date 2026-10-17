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
}
```

## Fields

| Name      | Type         | Notes                                                                                               |
| --------- | ------------ | --------------------------------------------------------------------------------------------------- |
| `at`      | `StateRef`   | StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>. |
| `cypher`  | `string`     | Single Lithograph Cypher 25 query passed unchanged; never SQL SELECT lithograph(...) syntax.        |
| `params?` | `JsonObject` | Optional JSON-compatible named Cypher parameters, referenced as $name in the query.                 |

## Related types

- `sdk/types/JsonObject.md`
- `sdk/types/StateRef.md`
