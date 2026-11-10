# GraphViewSelector

Optional Lithograph v0.3.5 query-local Label visibility; not an access-control boundary.

```ts
export interface GraphViewSelector {
  /** Node must have every required Label (AND). */
  requireAllLabels?: string[];
  /** Node must have at least one Label from this set (OR). */
  requireAnyLabels?: string[];
  /** Node must have none of these Labels (NOT). */
  excludeAnyLabels?: string[];
}
```

## Fields

| Name                | Type       | Notes                                                 |
| ------------------- | ---------- | ----------------------------------------------------- |
| `requireAllLabels?` | `string[]` | Node must have every required Label (AND).            |
| `requireAnyLabels?` | `string[]` | Node must have at least one Label from this set (OR). |
| `excludeAnyLabels?` | `string[]` | Node must have none of these Labels (NOT).            |
