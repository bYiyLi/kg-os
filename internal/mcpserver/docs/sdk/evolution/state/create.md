# evolution.state.create

**Write — kgos_mutate only**

Create a new Commit/State on an existing Branch, even without graph changes.

## Signature

```ts
evolution.state.create(request: StateCreateRequest): Promise<StateCreateResult>
```

## Constraints

Creates a Commit even when the graph snapshot does not change.

## Input and return types

- Request: `StateCreateRequest` — `sdk/types/StateCreateRequest.md`
- Return: `Promise<StateCreateResult>`

- `sdk/types/StateCreateResult.md`

## Example for kgos_mutate

```js
return await evolution.state.create({ branch: "<target-branch>", message: "Create a checkpoint" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
