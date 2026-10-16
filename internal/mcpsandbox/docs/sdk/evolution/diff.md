# evolution.diff

**Read — kgos_read / kgos_run**

Compare public changes between two immutable States.

## Signature

```ts
evolution.diff(request: EvolutionDiffRequest): Promise<EvolutionDiffResult>
```

## Constraints

scope is all, ontology, knowledge, or object. For object scope, supply an object filter with anchorState and ref.

## Input and return types

- Request: `EvolutionDiffRequest` — `docs.read('sdk/types/EvolutionDiffRequest.md')`
- Return: `Promise<EvolutionDiffResult>`

- `docs.read('sdk/types/EvolutionDiffResult.md')`

## Example for kgos_read

```js
return await evolution.diff({ before: "branch/main", after: "branch/main", scope: "all" });
```
