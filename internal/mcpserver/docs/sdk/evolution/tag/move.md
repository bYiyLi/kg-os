# evolution.tag.move

**Write — kgos_mutate only**

Move an existing Tag to another State.

## Signature

```ts
evolution.tag.move(request: TagMoveRequest): Promise<TagMutationResult>
```

## Input and return types

- Request: `TagMoveRequest` — `sdk/types/TagMoveRequest.md`
- Return: `Promise<TagMutationResult>`

- `sdk/types/TagMutationResult.md`

## Example for kgos_mutate

```js
return await evolution.tag.move({ name: "<existing-tag>", target: "branch/main" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
