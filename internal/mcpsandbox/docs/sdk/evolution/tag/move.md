# evolution.tag.move

**Write — kgos_run only**

Move an existing Tag to another State.

## Signature

```ts
evolution.tag.move(request: TagMoveRequest): Promise<TagMutationResult>
```

## Input and return types

- Request: `TagMoveRequest` — `docs.read('sdk/types/TagMoveRequest.md')`
- Return: `Promise<TagMutationResult>`

- `docs.read('sdk/types/TagMutationResult.md')`

## Example for kgos_run

```js
return await evolution.tag.move({ name: "<existing-tag>", target: "branch/main" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
