# MergeAbortResult

Identifier of an aborted Merge Session.

```ts
export interface MergeAbortResult {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
}
```

## Fields

| Name      | Type     | Notes                                                                      |
| --------- | -------- | -------------------------------------------------------------------------- |
| `session` | `string` | Identifier of a Merge Session; retrieve it before resolving or finalizing. |
