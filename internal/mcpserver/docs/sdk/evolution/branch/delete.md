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

## Example for kgos_mutate

```js
return await evolution.branch.delete({ name: "<target-branch>" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
