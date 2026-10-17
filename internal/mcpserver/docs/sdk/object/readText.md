# object.readText

**Read — kgos_query / kgos_mutate**

Read canonical editable Object text by Ref at a State.

## Signature

```ts
object.readText(request: ObjectReadRequest): Promise<ObjectTextReadResult>
```

## Input and return types

- Request: `ObjectReadRequest` — `sdk/types/ObjectReadRequest.md`
- Return: `Promise<ObjectTextReadResult>`

- `sdk/types/ObjectTextReadResult.md`

## Example for kgos_query

```js
return await object.readText({ at: "branch/main", refs: ["node:Person"] });
```

## Related guides

First read `guides/objects.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
