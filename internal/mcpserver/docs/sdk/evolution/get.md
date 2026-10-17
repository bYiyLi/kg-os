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

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
