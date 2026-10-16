# evolution.history

**Read — kgos_read / kgos_run**

Read public changes reachable from a State with scope filtering.

## Signature

```ts
evolution.history(request: EvolutionHistoryRequest): Promise<EvolutionHistoryResult>
```

## Constraints

scope is all, ontology, knowledge, or object. For object scope, supply an object filter with anchorState and ref.

## Input and return types

- Request: `EvolutionHistoryRequest` — `docs.read('sdk/types/EvolutionHistoryRequest.md')`
- Return: `Promise<EvolutionHistoryResult>`

- `docs.read('sdk/types/EvolutionHistoryResult.md')`

## Example for kgos_read

```js
return await evolution.history({ root: "branch/main", scope: "all", limit: 20 });
```
