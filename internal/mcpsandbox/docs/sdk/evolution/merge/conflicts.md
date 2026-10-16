# evolution.merge.conflicts

**Read — kgos_read / kgos_run**

Read paginated Merge conflicts and the current Session revision.

## Signature

```ts
evolution.merge.conflicts(request: MergeConflictsRequest): Promise<MergeConflictsResult>
```

## Input and return types

- Request: `MergeConflictsRequest` — `docs.read('sdk/types/MergeConflictsRequest.md')`
- Return: `Promise<MergeConflictsResult>`

- `docs.read('sdk/types/MergeConflictsResult.md')`

## Example for kgos_read

```js
return await evolution.merge.conflicts({ session: "<session-id>", limit: 20 });
```
