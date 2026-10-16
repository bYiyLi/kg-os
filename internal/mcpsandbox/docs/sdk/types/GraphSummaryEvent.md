# GraphSummaryEvent

Successful final Graph streaming event; a missing summary means success is not confirmed.

```ts
export interface GraphSummaryEvent {
  /** Variant tag; Graph streaming events are columns, row or summary. */
  type: "summary";
  /** Resolved Commit in the successful terminal Graph stream summary. */
  state: ResolvedState;
  /** Counters returned by the Lithograph execution; not proof of one new Commit. */
  counters?: JsonValue;
}
```

## Fields

| Name        | Type            | Notes                                                                       |
| ----------- | --------------- | --------------------------------------------------------------------------- |
| `type`      | `"summary"`     | Variant tag; Graph streaming events are columns, row or summary.            |
| `state`     | `ResolvedState` | Resolved Commit in the successful terminal Graph stream summary.            |
| `counters?` | `JsonValue`     | Counters returned by the Lithograph execution; not proof of one new Commit. |

## Related types

- `docs.read('sdk/types/JsonValue.md')`
- `docs.read('sdk/types/ResolvedState.md')`
