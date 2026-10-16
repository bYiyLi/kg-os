# object.readText

**Read — kgos_read / kgos_run**

Read canonical editable Object text by Ref at a State.

## Signature

```ts
object.readText(request: ObjectReadRequest): Promise<ObjectTextReadResult>
```

## Input and return types

- Request: `ObjectReadRequest` — `docs.read('sdk/types/ObjectReadRequest.md')`
- Return: `Promise<ObjectTextReadResult>`

- `docs.read('sdk/types/ObjectTextReadResult.md')`

## Example for kgos_read

```js
return await object.readText({ at: "branch/main", refs: ["node:Person"] });
```
