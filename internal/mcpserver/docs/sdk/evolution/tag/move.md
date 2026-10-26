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
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
return await evolution.tag.move({ name: "<existing-tag>", target: "branch/main" });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
