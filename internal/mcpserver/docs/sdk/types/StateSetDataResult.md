# StateSetDataResult

Updated mutable State Data for the referenced Commit.

```ts
export interface StateSetDataResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** JSON-compatible mutable State Data; not part of the versioned graph snapshot. */
  data: JsonValue;
}
```

## Fields

| Name    | Type            | Notes                                                                               |
| ------- | --------------- | ----------------------------------------------------------------------------------- |
| `state` | `ResolvedState` | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |
| `data`  | `JsonValue`     | JSON-compatible mutable State Data; not part of the versioned graph snapshot.       |

## Related types

- `sdk/types/JsonValue.md`
- `sdk/types/ResolvedState.md`
