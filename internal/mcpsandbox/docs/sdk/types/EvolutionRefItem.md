# EvolutionRefItem

Named Branch or Tag and its current resolved Commit.

```ts
export interface EvolutionRefItem {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}
```

## Fields

| Name    | Type            | Notes                                                                               |
| ------- | --------------- | ----------------------------------------------------------------------------------- |
| `name`  | `string`        | Name of this Branch, Tag, or public resource.                                       |
| `state` | `ResolvedState` | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |

## Related types

- `docs.read('sdk/types/ResolvedState.md')`
