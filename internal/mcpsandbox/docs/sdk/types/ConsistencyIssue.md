# ConsistencyIssue

One KG OS Snapshot consistency diagnosis.

```ts
export interface ConsistencyIssue {
  /** Stable public code distinguishing failure classes. */
  code: string;
  /** Explanation of the specific inconsistency in this State. */
  message: string;
}
```

## Fields

| Name      | Type     | Notes                                                    |
| --------- | -------- | -------------------------------------------------------- |
| `code`    | `string` | Stable public code distinguishing failure classes.       |
| `message` | `string` | Explanation of the specific inconsistency in this State. |
