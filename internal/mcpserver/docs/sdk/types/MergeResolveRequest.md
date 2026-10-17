# MergeResolveRequest

Apply conflict resolutions using the observed Merge Session revision.

```ts
export interface MergeResolveRequest {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Revision observed from merge.get/conflicts. Stale revisions are rejected. */
  expectedRevision: number;
  /** Resolutions of individual conflict IDs: ours/theirs without a value, or value with a required replacement. */
  resolutions: MergeResolution[];
}
```

## Fields

| Name               | Type                | Notes                                                                                                      |
| ------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `session`          | `string`            | Identifier of a Merge Session; retrieve it before resolving or finalizing.                                 |
| `expectedRevision` | `number`            | Revision observed from merge.get/conflicts. Stale revisions are rejected.                                  |
| `resolutions`      | `MergeResolution[]` | Resolutions of individual conflict IDs: ours/theirs without a value, or value with a required replacement. |

## Related types

- `sdk/types/MergeResolution.md`
