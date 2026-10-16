# StateSetDataRequest

Change mutable State Data without changing the immutable graph/Commit.

```ts
export interface StateSetDataRequest {
  /** StateRef to the existing Commit whose mutable sidecar Data is updated. */
  state: StateRef;
  /** JSON-compatible mutable State Data; not part of the versioned graph snapshot. */
  data: JsonValue;
}
```

## Fields

| Name    | Type        | Notes                                                                         |
| ------- | ----------- | ----------------------------------------------------------------------------- |
| `state` | `StateRef`  | StateRef to the existing Commit whose mutable sidecar Data is updated.        |
| `data`  | `JsonValue` | JSON-compatible mutable State Data; not part of the versioned graph snapshot. |

## Related types

- `docs.read('sdk/types/JsonValue.md')`
- `docs.read('sdk/types/StateRef.md')`
