# BranchDeleteRequest

Delete a Branch name without deleting its immutable Commit history.

```ts
export interface BranchDeleteRequest {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
}
```

## Fields

| Name   | Type     | Notes                                         |
| ------ | -------- | --------------------------------------------- |
| `name` | `string` | Name of this Branch, Tag, or public resource. |
