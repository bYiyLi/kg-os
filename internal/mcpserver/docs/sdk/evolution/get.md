# evolution.get

**Read — kgos_query / kgos_mutate**

Inspect one State's metadata, consistency, and State Data.

## Signature

```ts
evolution.get(request: EvolutionGetRequest): Promise<EvolutionGetResult>
```

## Input and return types

- Request: `EvolutionGetRequest` — `sdk/types/EvolutionGetRequest.md`
- Return: `Promise<EvolutionGetResult>`

- `sdk/types/EvolutionGetResult.md`

## Example for kgos_query

```js
return await evolution.get({ state: "branch/main" });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
