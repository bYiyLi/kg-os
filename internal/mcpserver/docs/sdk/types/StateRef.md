# StateRef

State reference resolved at the start of each read: commit, branch, or tag.

```ts
export type StateRef = `commit/${string}` | `branch/${string}` | `tag/${string}`;
```
