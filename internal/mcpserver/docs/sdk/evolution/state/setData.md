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
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
const { state } = await evolution.state.create({
  branch: "<isolated-test-branch>",
  message: "Create test-only state"
});
return await evolution.state.setData({ state, data: { note: "reviewed" } });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
