# evolution.diff

**Read — kgos_query / kgos_mutate**

Compare public changes between two immutable States.

## Signature

```ts
evolution.diff(request: EvolutionDiffRequest): Promise<EvolutionDiffResult>
```

## Constraints

scope is all, ontology, knowledge, or object. For object scope, supply an object filter with anchorState and ref.

## Input and return types

- Request: `EvolutionDiffRequest` — `sdk/types/EvolutionDiffRequest.md`
- Return: `Promise<EvolutionDiffResult>`

- `sdk/types/EvolutionDiffResult.md`

## Example for kgos_query

```js
return await evolution.diff({ before: "branch/main", after: "branch/main", scope: "all" });
```

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
