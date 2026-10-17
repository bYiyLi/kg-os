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

## Example for kgos_mutate

```js
return await evolution.tag.create({ name: "<new-tag>", target: "branch/main" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
