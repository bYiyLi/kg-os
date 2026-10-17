# StateSummary

Immutable Commit identity, parents, author/message and UTC microsecond timestamp.

```ts
export interface StateSummary {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Immutable parent Commit references in ancestry order. */
  parents: ResolvedState[];
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
  /** Commit timestamp in UTC Unix epoch microseconds, not a Date string. */
  committedAt: number;
}
```

## Fields

| Name          | Type              | Notes                                                                               |
| ------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `state`       | `ResolvedState`   | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |
| `parents`     | `ResolvedState[]` | Immutable parent Commit references in ancestry order.                               |
| `author?`     | `string`          | Optional author text preserved as Commit metadata when a Commit is created.         |
| `message?`    | `string`          | Optional Commit message; do not assume every operation creates one.                 |
| `committedAt` | `number`          | Commit timestamp in UTC Unix epoch microseconds, not a Date string.                 |

## Related types

- `sdk/types/ResolvedState.md`
