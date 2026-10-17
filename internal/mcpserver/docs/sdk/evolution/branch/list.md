# evolution.branch.list

**Read — kgos_query / kgos_mutate**

List Branch names and their current States.

## Signature

```ts
evolution.branch.list(): Promise<EvolutionRefListResult>
```

## Input and return types

- Request: no request argument
- Return: `Promise<EvolutionRefListResult>`

- `sdk/types/EvolutionRefListResult.md`

## Example for kgos_query

```js
return await evolution.branch.list();
```

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
