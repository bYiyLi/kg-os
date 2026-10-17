# evolution.history

**Read — kgos_query / kgos_mutate**

Read public changes reachable from a State with scope filtering.

## Signature

```ts
evolution.history(request: EvolutionHistoryRequest): Promise<EvolutionHistoryResult>
```

## Constraints

scope is all, ontology, knowledge, or object. For object scope, supply an object filter with anchorState and ref.

## Input and return types

- Request: `EvolutionHistoryRequest` — `sdk/types/EvolutionHistoryRequest.md`
- Return: `Promise<EvolutionHistoryResult>`

- `sdk/types/EvolutionHistoryResult.md`

## Example for kgos_query

```js
return await evolution.history({ root: "branch/main", scope: "all", limit: 20 });
```

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
