# evolution.merge.conflicts

**Read — kgos_query / kgos_mutate**

Read paginated Merge conflicts and the current Session revision.

## Signature

```ts
evolution.merge.conflicts(request: MergeConflictsRequest): Promise<MergeConflictsResult>
```

## Input and return types

- Request: `MergeConflictsRequest` — `sdk/types/MergeConflictsRequest.md`
- Return: `Promise<MergeConflictsResult>`

- `sdk/types/MergeConflictsResult.md`

## Example for kgos_query

```js
return await evolution.merge.conflicts({ session: "<session-id>", limit: 20 });
```

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
