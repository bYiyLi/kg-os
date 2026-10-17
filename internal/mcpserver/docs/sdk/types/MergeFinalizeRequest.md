# MergeFinalizeRequest

Finalize a ready Merge Session with optimistic revision checking.

```ts
export interface MergeFinalizeRequest {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Revision observed from merge.get/conflicts. Stale revisions are rejected. */
  expectedRevision: number;
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
}
```

## Fields

| Name               | Type     | Notes                                                                       |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| `session`          | `string` | Identifier of a Merge Session; retrieve it before resolving or finalizing.  |
| `expectedRevision` | `number` | Revision observed from merge.get/conflicts. Stale revisions are rejected.   |
| `author?`          | `string` | Optional author text preserved as Commit metadata when a Commit is created. |
| `message?`         | `string` | Optional Commit message; do not assume every operation creates one.         |
