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

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
