# MergeStartRequest

Start a Merge Session against the current Head of a Branch.

```ts
export interface MergeStartRequest {
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** StateRef to merge into the target Branch. */
  source: StateRef;
}
```

## Fields

| Name     | Type       | Notes                                                                |
| -------- | ---------- | -------------------------------------------------------------------- |
| `branch` | `string`   | Existing target Branch name; a plain Branch name, not branch/<name>. |
| `source` | `StateRef` | StateRef to merge into the target Branch.                            |

## Related types

- `docs.read('sdk/types/StateRef.md')`
