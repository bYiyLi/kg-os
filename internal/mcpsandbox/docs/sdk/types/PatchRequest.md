# PatchRequest

Atomic Git Extended Diff patch against a known base State and explicit target Branch.

```ts
export interface PatchRequest {
  /** Immutable Commit observed before editing; must be commit/<64-lowercase-hex>. A stale base returns STALE_BASE_STATE. */
  baseState: ResolvedState;
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** Canonical Git Extended Diff text. Construct from an observed Object/ Ontology read, not raw SQL. */
  patch: string;
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
}
```

## Fields

| Name        | Type            | Notes                                                                                                               |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `baseState` | `ResolvedState` | Immutable Commit observed before editing; must be commit/<64-lowercase-hex>. A stale base returns STALE_BASE_STATE. |
| `branch`    | `string`        | Existing target Branch name; a plain Branch name, not branch/<name>.                                                |
| `patch`     | `string`        | Canonical Git Extended Diff text. Construct from an observed Object/ Ontology read, not raw SQL.                    |
| `author?`   | `string`        | Optional author text preserved as Commit metadata when a Commit is created.                                         |
| `message?`  | `string`        | Optional Commit message; do not assume every operation creates one.                                                 |

## Related types

- `docs.read('sdk/types/ResolvedState.md')`
