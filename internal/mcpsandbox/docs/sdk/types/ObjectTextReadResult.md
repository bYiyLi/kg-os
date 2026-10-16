# ObjectTextReadResult

Canonical text results pinned to one State.

```ts
export interface ObjectTextReadResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Requested canonical editable Object YAML bodies in the same pinned Snapshot. */
  results: ObjectTextReadItem[];
}
```

## Fields

| Name      | Type                   | Notes                                                                               |
| --------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `state`   | `ResolvedState`        | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |
| `results` | `ObjectTextReadItem[]` | Requested canonical editable Object YAML bodies in the same pinned Snapshot.        |

## Related types

- `docs.read('sdk/types/ObjectTextReadItem.md')`
- `docs.read('sdk/types/ResolvedState.md')`
