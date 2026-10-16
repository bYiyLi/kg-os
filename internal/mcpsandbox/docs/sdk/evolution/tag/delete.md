# evolution.tag.delete

**Write — kgos_run only**

Remove a Tag reference without deleting the underlying Commit.

## Signature

```ts
evolution.tag.delete(request: TagDeleteRequest): Promise<TagMutationResult>
```

## Input and return types

- Request: `TagDeleteRequest` — `docs.read('sdk/types/TagDeleteRequest.md')`
- Return: `Promise<TagMutationResult>`

- `docs.read('sdk/types/TagMutationResult.md')`

## Example for kgos_run

```js
return await evolution.tag.delete({ name: "<target-tag>" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
