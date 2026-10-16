# evolution.tag.list

**Read — kgos_read / kgos_run**

List Tag names and their current States.

## Signature

```ts
evolution.tag.list(): Promise<EvolutionRefListResult>
```

## Input and return types

- Request: no request argument
- Return: `Promise<EvolutionRefListResult>`

- `docs.read('sdk/types/EvolutionRefListResult.md')`

## Example for kgos_read

```js
return await evolution.tag.list();
```
