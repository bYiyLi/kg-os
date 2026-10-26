# evolution.tag.list

**Read — kgos_query / kgos_mutate**

List Tag names and their current States.

## Signature

```ts
evolution.tag.list(): Promise<EvolutionRefListResult>
```

## Input and return types

- Request: no request argument
- Return: `Promise<EvolutionRefListResult>`

- `sdk/types/EvolutionRefListResult.md`

## Example for kgos_query

```js
return await evolution.tag.list();
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
