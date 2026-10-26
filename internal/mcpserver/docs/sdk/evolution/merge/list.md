# evolution.merge.list

**Read — kgos_query / kgos_mutate**

List Merge Sessions with optional pagination.

## Signature

```ts
evolution.merge.list(request?: MergeListRequest): Promise<MergeListResult>
```

## Input and return types

- Request: `MergeListRequest` — `sdk/types/MergeListRequest.md`
- Return: `Promise<MergeListResult>`

- `sdk/types/MergeListResult.md`

## Example for kgos_query

```js
return await evolution.merge.list({ limit: 20 });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
