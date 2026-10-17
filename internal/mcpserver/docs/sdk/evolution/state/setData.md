# evolution.state.setData

**Write — kgos_mutate only**

Replace the mutable JSON State Data on an existing State; no new Commit.

## Signature

```ts
evolution.state.setData(request: StateSetDataRequest): Promise<StateSetDataResult>
```

## Constraints

State Data is a mutable annotation keyed by Commit, shared by all Branches pointing at it. Change only a Commit exclusively created for this purpose; do not modify a shared/default Branch Commit for testing.

## Input and return types

- Request: `StateSetDataRequest` — `sdk/types/StateSetDataRequest.md`
- Return: `Promise<StateSetDataResult>`

- `sdk/types/StateSetDataResult.md`

## Example for kgos_mutate

```js
const { state } = await evolution.state.create({
  branch: "<isolated-test-branch>",
  message: "Create test-only state"
});
return await evolution.state.setData({ state, data: { note: "reviewed" } });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
