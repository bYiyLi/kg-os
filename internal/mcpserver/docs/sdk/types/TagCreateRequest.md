# TagCreateRequest

Create a Tag pointing at an existing State.

```ts
export interface TagCreateRequest {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Existing target StateRef (commit, branch, or tag) for a Tag. */
  target: StateRef;
}
```

## Fields

| Name     | Type       | Notes                                                        |
| -------- | ---------- | ------------------------------------------------------------ |
| `name`   | `string`   | Name of this Branch, Tag, or public resource.                |
| `target` | `StateRef` | Existing target StateRef (commit, branch, or tag) for a Tag. |

## Related types

- `sdk/types/StateRef.md`
