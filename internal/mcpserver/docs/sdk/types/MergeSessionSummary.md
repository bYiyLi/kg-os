# MergeSessionSummary

Identity, source/target States and optimistic revision of a Merge Session.

```ts
export interface MergeSessionSummary {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** Target Branch's pinned resolved Commit for this Merge Session. */
  targetState: ResolvedState;
  /** Resolved source Commit for this Merge Session. */
  sourceState: ResolvedState;
  /** Current optimistic Merge Session revision. */
  revision: number;
}
```

## Fields

| Name          | Type            | Notes                                                                      |
| ------------- | --------------- | -------------------------------------------------------------------------- |
| `session`     | `string`        | Identifier of a Merge Session; retrieve it before resolving or finalizing. |
| `branch`      | `string`        | Existing target Branch name; a plain Branch name, not branch/<name>.       |
| `targetState` | `ResolvedState` | Target Branch's pinned resolved Commit for this Merge Session.             |
| `sourceState` | `ResolvedState` | Resolved source Commit for this Merge Session.                             |
| `revision`    | `number`        | Current optimistic Merge Session revision.                                 |

## Related types

- `sdk/types/ResolvedState.md`
