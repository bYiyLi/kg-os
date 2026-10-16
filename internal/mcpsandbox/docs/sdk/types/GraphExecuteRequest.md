# GraphExecuteRequest

Execute unchanged Cypher on a Branch through a read/write connection.

```ts
export interface GraphExecuteRequest {
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** Single Lithograph Cypher 25 query passed unchanged; never SQL SELECT lithograph(...) syntax. */
  cypher: string;
  /** Optional JSON-compatible named Cypher parameters, referenced as $name in the query. */
  params?: JsonObject;
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
}
```

## Fields

| Name       | Type         | Notes                                                                                        |
| ---------- | ------------ | -------------------------------------------------------------------------------------------- |
| `branch`   | `string`     | Existing target Branch name; a plain Branch name, not branch/<name>.                         |
| `cypher`   | `string`     | Single Lithograph Cypher 25 query passed unchanged; never SQL SELECT lithograph(...) syntax. |
| `params?`  | `JsonObject` | Optional JSON-compatible named Cypher parameters, referenced as $name in the query.          |
| `author?`  | `string`     | Optional author text preserved as Commit metadata when a Commit is created.                  |
| `message?` | `string`     | Optional Commit message; do not assume every operation creates one.                          |

## Related types

- `docs.read('sdk/types/JsonObject.md')`
