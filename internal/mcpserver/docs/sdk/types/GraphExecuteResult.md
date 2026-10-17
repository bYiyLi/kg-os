# GraphExecuteResult

Graph execution result including Lithograph's counters without asserting that a Commit was created.

```ts
export interface GraphExecuteResult extends GraphQueryResult {
  /** Counters returned by the Lithograph execution; not proof of one new Commit. */
  counters: JsonValue;
}
```

## Fields

| Name       | Type        | Notes                                                                       |
| ---------- | ----------- | --------------------------------------------------------------------------- |
| `counters` | `JsonValue` | Counters returned by the Lithograph execution; not proof of one new Commit. |

## Related types

- `sdk/types/GraphQueryResult.md`
- `sdk/types/JsonValue.md`
