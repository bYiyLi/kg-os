# StateClearDataRequest

Remove mutable State Data attached to a Commit.

```ts
export interface StateClearDataRequest {
  /** StateRef to the existing Commit whose mutable sidecar Data is cleared. */
  state: StateRef;
}
```

## Fields

| Name    | Type       | Notes                                                                  |
| ------- | ---------- | ---------------------------------------------------------------------- |
| `state` | `StateRef` | StateRef to the existing Commit whose mutable sidecar Data is cleared. |

## Related types

- `docs.read('sdk/types/StateRef.md')`
