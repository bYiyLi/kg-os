# evolution.branch.create

**Write — kgos_run only**

Create a Branch from a specified existing State.

## Signature

```ts
evolution.branch.create(request: BranchCreateRequest): Promise<BranchMutationResult>
```

## Input and return types

- Request: `BranchCreateRequest` — `docs.read('sdk/types/BranchCreateRequest.md')`
- Return: `Promise<BranchMutationResult>`

- `docs.read('sdk/types/BranchMutationResult.md')`

## Example for kgos_run

```js
return await evolution.branch.create({ name: "<new-branch>", from: "branch/main" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
