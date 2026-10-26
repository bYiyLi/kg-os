# evolution.merge.get

**Read — kgos_query / kgos_mutate**

Read the current status and revision of a Merge Session.

## Signature

```ts
evolution.merge.get(request: MergeGetRequest): Promise<MergeSession>
```

## Input and return types

- Request: `MergeGetRequest` — `sdk/types/MergeGetRequest.md`
- Return: `Promise<MergeSession>`

- `sdk/types/MergeSession.md`

## Example for kgos_query

```js
return await evolution.merge.get({ session: "<session-id>" });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
