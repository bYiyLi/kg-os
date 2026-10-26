# evolution.branch.delete

**Write — kgos_mutate only**

Delete a Branch reference, not its immutable Commit history.

## Signature

```ts
evolution.branch.delete(request: BranchDeleteRequest): Promise<BranchMutationResult>
```

## Input and return types

- Request: `BranchDeleteRequest` — `sdk/types/BranchDeleteRequest.md`
- Return: `Promise<BranchMutationResult>`

- `sdk/types/BranchMutationResult.md`
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
return await evolution.branch.delete({ name: "<target-branch>" });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
