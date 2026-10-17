# MergeSession

Merge Session plus state of conflict resolution.

```ts
export interface MergeSession extends MergeSessionSummary {
  /** Merge state: up_to_date, fast_forward, conflicted, or ready. */
  status: MergeSessionStatus;
  /** Number of remaining unresolved conflicts. */
  unresolved: number;
}
```

## Fields

| Name         | Type                 | Notes                                                        |
| ------------ | -------------------- | ------------------------------------------------------------ |
| `status`     | `MergeSessionStatus` | Merge state: up_to_date, fast_forward, conflicted, or ready. |
| `unresolved` | `number`             | Number of remaining unresolved conflicts.                    |

## Related types

- `sdk/types/MergeSessionStatus.md`
- `sdk/types/MergeSessionSummary.md`
