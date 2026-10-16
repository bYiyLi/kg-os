# evolution.ancestry

**Read — kgos_read / kgos_run**

Read a paginated ancestor DAG from a Branch or Commit.

## Signature

```ts
evolution.ancestry(request: EvolutionAncestryRequest): Promise<EvolutionAncestryResult>
```

## Input and return types

- Request: `EvolutionAncestryRequest` — `docs.read('sdk/types/EvolutionAncestryRequest.md')`
- Return: `Promise<EvolutionAncestryResult>`

- `docs.read('sdk/types/EvolutionAncestryResult.md')`

## Example for kgos_read

```js
return await evolution.ancestry({ root: "branch/main", limit: 20 });
```
