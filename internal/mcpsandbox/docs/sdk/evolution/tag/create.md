# evolution.tag.create

**Write — kgos_run only**

Create a Tag pointing at a State.

## Signature

```ts
evolution.tag.create(request: TagCreateRequest): Promise<TagMutationResult>
```

## Input and return types

- Request: `TagCreateRequest` — `docs.read('sdk/types/TagCreateRequest.md')`
- Return: `Promise<TagMutationResult>`

- `docs.read('sdk/types/TagMutationResult.md')`

## Example for kgos_run

```js
return await evolution.tag.create({ name: "<new-tag>", target: "branch/main" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
