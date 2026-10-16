# object.read

**Read — kgos_read / kgos_run**

Read public Ontology or Knowledge Objects by Ref at a State.

## Signature

```ts
object.read(request: ObjectReadRequest): Promise<ObjectReadResult>
```

## Input and return types

- Request: `ObjectReadRequest` — `docs.read('sdk/types/ObjectReadRequest.md')`
- Return: `Promise<ObjectReadResult>`

- `docs.read('sdk/types/ObjectReadResult.md')`

## Example for kgos_read

```js
return await object.read({ at: "branch/main", refs: ["node:Person"] });
```
