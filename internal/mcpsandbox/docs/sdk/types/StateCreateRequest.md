# StateCreateRequest

Create a Commit, even with no graph delta, on an existing Branch.

```ts
export interface StateCreateRequest {
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** Optional mutable JSON State Data to accompany the newly created Commit. */
  data?: JsonValue;
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
}
```

## Fields

| Name       | Type        | Notes                                                                       |
| ---------- | ----------- | --------------------------------------------------------------------------- |
| `branch`   | `string`    | Existing target Branch name; a plain Branch name, not branch/<name>.        |
| `data?`    | `JsonValue` | Optional mutable JSON State Data to accompany the newly created Commit.     |
| `author?`  | `string`    | Optional author text preserved as Commit metadata when a Commit is created. |
| `message?` | `string`    | Optional Commit message; do not assume every operation creates one.         |

## Related types

- `docs.read('sdk/types/JsonValue.md')`
