# EvolutionObjectFilter

Select one public Object from a pinned anchor State.

```ts
export interface EvolutionObjectFilter {
  /** StateRef at which the filtered Object identity was observed. */
  anchorState: StateRef;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
}
```

## Fields

| Name          | Type       | Notes                                                                                       |
| ------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `anchorState` | `StateRef` | StateRef at which the filtered Object identity was observed.                                |
| `ref`         | `string`   | Canonical public Object identity. Do not treat a mutable title or business key as identity. |

## Related types

- `sdk/types/StateRef.md`
