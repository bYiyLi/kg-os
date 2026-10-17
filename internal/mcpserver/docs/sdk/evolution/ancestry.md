# evolution.ancestry

**Read — kgos_query / kgos_mutate**

Read a paginated ancestor DAG from a Branch or Commit.

## Signature

```ts
evolution.ancestry(request: EvolutionAncestryRequest): Promise<EvolutionAncestryResult>
```

## Input and return types

- Request: `EvolutionAncestryRequest` — `sdk/types/EvolutionAncestryRequest.md`
- Return: `Promise<EvolutionAncestryResult>`

- `sdk/types/EvolutionAncestryResult.md`

## Example for kgos_query

```js
return await evolution.ancestry({ root: "branch/main", limit: 20 });
```

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
