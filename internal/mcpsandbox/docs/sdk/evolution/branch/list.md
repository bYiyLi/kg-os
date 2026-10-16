# evolution.branch.list

**Read — kgos_read / kgos_run**

List Branch names and their current States.

## Signature

```ts
evolution.branch.list(): Promise<EvolutionRefListResult>
```

## Input and return types

- Request: no request argument
- Return: `Promise<EvolutionRefListResult>`

- `docs.read('sdk/types/EvolutionRefListResult.md')`

## Example for kgos_read

```js
return await evolution.branch.list();
```
