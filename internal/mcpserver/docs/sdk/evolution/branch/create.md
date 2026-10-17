# evolution.branch.create

**Write — kgos_mutate only**

Create a Branch from a specified existing State.

## Signature

```ts
evolution.branch.create(request: BranchCreateRequest): Promise<BranchMutationResult>
```

## Input and return types

- Request: `BranchCreateRequest` — `sdk/types/BranchCreateRequest.md`
- Return: `Promise<BranchMutationResult>`

- `sdk/types/BranchMutationResult.md`

## Example for kgos_mutate

```js
return await evolution.branch.create({ name: "<new-branch>", from: "branch/main" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
