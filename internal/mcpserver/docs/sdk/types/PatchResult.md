# PatchResult

Committed State and identifier mappings returned by a successful Patch.

```ts
export interface PatchResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** New Objects with their request aliases and resolved refs. */
  created: CreatedObject[];
  /** Public identity transitions reported by the patch; does not create a permanent alias. */
  transitions: RefTransition[];
}
```

## Fields

| Name          | Type              | Notes                                                                                 |
| ------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `state`       | `ResolvedState`   | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>.   |
| `created`     | `CreatedObject[]` | New Objects with their request aliases and resolved refs.                             |
| `transitions` | `RefTransition[]` | Public identity transitions reported by the patch; does not create a permanent alias. |

## Related types

- `sdk/types/CreatedObject.md`
- `sdk/types/RefTransition.md`
- `sdk/types/ResolvedState.md`
