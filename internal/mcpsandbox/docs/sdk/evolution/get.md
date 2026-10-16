# evolution.get

**Read — kgos_read / kgos_run**

Inspect one State's metadata, consistency, and State Data.

## Signature

```ts
evolution.get(request: EvolutionGetRequest): Promise<EvolutionGetResult>
```

## Input and return types

- Request: `EvolutionGetRequest` — `docs.read('sdk/types/EvolutionGetRequest.md')`
- Return: `Promise<EvolutionGetResult>`

- `docs.read('sdk/types/EvolutionGetResult.md')`

## Example for kgos_read

```js
return await evolution.get({ state: "branch/main" });
```
