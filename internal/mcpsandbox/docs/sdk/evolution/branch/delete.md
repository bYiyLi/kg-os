# evolution.branch.delete

**Write — kgos_run only**

Delete a Branch reference, not its immutable Commit history.

## Signature

```ts
evolution.branch.delete(request: BranchDeleteRequest): Promise<BranchMutationResult>
```

## Input and return types

- Request: `BranchDeleteRequest` — `docs.read('sdk/types/BranchDeleteRequest.md')`
- Return: `Promise<BranchMutationResult>`

- `docs.read('sdk/types/BranchMutationResult.md')`

## Example for kgos_run

```js
return await evolution.branch.delete({ name: "<target-branch>" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
