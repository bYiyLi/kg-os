# evolution.tag.create

**Write — kgos_mutate only**

Create a Tag pointing at a State.

## Signature

```ts
evolution.tag.create(request: TagCreateRequest): Promise<TagMutationResult>
```

## Input and return types

- Request: `TagCreateRequest` — `sdk/types/TagCreateRequest.md`
- Return: `Promise<TagMutationResult>`

- `sdk/types/TagMutationResult.md`
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
return await evolution.tag.create({ name: "<new-tag>", target: "branch/main" });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
