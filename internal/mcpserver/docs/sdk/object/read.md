# object.read

**Read — kgos_query / kgos_mutate**

Read public Ontology or Knowledge Objects by Ref at a State.

## Signature

```ts
object.read(request: ObjectReadRequest): Promise<ObjectReadResult>
```

## Input and return types

- Request: `ObjectReadRequest` — `sdk/types/ObjectReadRequest.md`
- Return: `Promise<ObjectReadResult>`

- `sdk/types/ObjectReadResult.md`

## Example for kgos_query

```js
return await object.read({ at: "branch/main", refs: ["node:Person"] });
```

## Related guides

For task context not already established, read `guides/reading.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
