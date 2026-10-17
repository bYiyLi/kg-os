# BranchMutationResult

Result of creating or removing a Branch reference.

```ts
export interface BranchMutationResult {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state?: ResolvedState;
  /** Prior resolved Commit reference, if an existing ref moved. */
  previousState?: ResolvedState;
}
```

## Fields

| Name             | Type            | Notes                                                                               |
| ---------------- | --------------- | ----------------------------------------------------------------------------------- |
| `name`           | `string`        | Name of this Branch, Tag, or public resource.                                       |
| `state?`         | `ResolvedState` | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |
| `previousState?` | `ResolvedState` | Prior resolved Commit reference, if an existing ref moved.                          |

## Related types

- `sdk/types/ResolvedState.md`
