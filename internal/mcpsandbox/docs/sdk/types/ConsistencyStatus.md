# ConsistencyStatus

Validity and detailed problems when interpreting a Snapshot as KG OS data.

```ts
export interface ConsistencyStatus {
  /** Validity status for KG OS interpretation of the resolved graph State. */
  status: string;
  /** Consistency problems that prevent interpreting this State as a valid KG OS snapshot. */
  issues: ConsistencyIssue[];
}
```

## Fields

| Name     | Type                 | Notes                                                                                |
| -------- | -------------------- | ------------------------------------------------------------------------------------ |
| `status` | `string`             | Validity status for KG OS interpretation of the resolved graph State.                |
| `issues` | `ConsistencyIssue[]` | Consistency problems that prevent interpreting this State as a valid KG OS snapshot. |

## Related types

- `docs.read('sdk/types/ConsistencyIssue.md')`
