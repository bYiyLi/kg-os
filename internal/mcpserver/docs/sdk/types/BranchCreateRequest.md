# BranchCreateRequest

Create a Branch pointing at an existing Commit/Branch/Tag StateRef.

```ts
export interface BranchCreateRequest {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Source StateRef for creating the Branch; write branch/main, not main. */
  from: StateRef;
}
```

## Fields

| Name   | Type       | Notes                                                                 |
| ------ | ---------- | --------------------------------------------------------------------- |
| `name` | `string`   | Name of this Branch, Tag, or public resource.                         |
| `from` | `StateRef` | Source StateRef for creating the Branch; write branch/main, not main. |

## Related types

- `sdk/types/StateRef.md`
