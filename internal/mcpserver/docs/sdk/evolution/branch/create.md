# evolution.branch.create

**Write — kgos_mutate only**

Create a Branch from a specified existing State. Name the world's actual purpose, respect valid user-chosen names and check collisions; see guides/evolution.md. This method does not create a Commit or accept message.

## Signature

```ts
evolution.branch.create(request: BranchCreateRequest): Promise<BranchMutationResult>
```

## Input and return types

- Request: `BranchCreateRequest` — `sdk/types/BranchCreateRequest.md`
- Return: `Promise<BranchMutationResult>`

- `sdk/types/BranchMutationResult.md`
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
return await evolution.branch.create({ name: "<new-branch>", from: "branch/main" });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
