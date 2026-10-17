# evolution.overview

**Read — kgos_query / kgos_mutate**

Resolve the default Branch and current State.

## Signature

```ts
evolution.overview(): Promise<EvolutionOverviewResult>
```

## Input and return types

- Request: no request argument
- Return: `Promise<EvolutionOverviewResult>`

- `sdk/types/EvolutionOverviewResult.md`

## Example for kgos_query

```js
return await evolution.overview();
```

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
