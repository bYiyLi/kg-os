# MergeAbortRequest

Abort an unfinished Merge Session at an expected revision.

```ts
export interface MergeAbortRequest {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Revision observed from merge.get/conflicts. Stale revisions are rejected. */
  expectedRevision: number;
}
```

## Fields

| Name               | Type     | Notes                                                                      |
| ------------------ | -------- | -------------------------------------------------------------------------- |
| `session`          | `string` | Identifier of a Merge Session; retrieve it before resolving or finalizing. |
| `expectedRevision` | `number` | Revision observed from merge.get/conflicts. Stale revisions are rejected.  |
