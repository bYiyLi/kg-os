# evolution.state.create

**Write — kgos_run only**

Create a new Commit/State on an existing Branch, even without graph changes.

## Signature

```ts
evolution.state.create(request: StateCreateRequest): Promise<StateCreateResult>
```

## Constraints

Creates a Commit even when the graph snapshot does not change.

## Input and return types

- Request: `StateCreateRequest` — `docs.read('sdk/types/StateCreateRequest.md')`
- Return: `Promise<StateCreateResult>`

- `docs.read('sdk/types/StateCreateResult.md')`

## Example for kgos_run

```js
return await evolution.state.create({ branch: "<target-branch>", message: "Create a checkpoint" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
