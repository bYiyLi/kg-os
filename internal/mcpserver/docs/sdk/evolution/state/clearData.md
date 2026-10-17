# evolution.state.clearData

**Write — kgos_mutate only**

Remove a State's mutable Data annotation; no new Commit.

## Signature

```ts
evolution.state.clearData(request: StateClearDataRequest): Promise<StateClearDataResult>
```

## Constraints

Only clear Data on a Commit exclusively created for this purpose; shared/default Branch Commits may carry State Data used elsewhere.

## Input and return types

- Request: `StateClearDataRequest` — `sdk/types/StateClearDataRequest.md`
- Return: `Promise<StateClearDataResult>`

- `sdk/types/StateClearDataResult.md`

## Example for kgos_mutate

```js
const { state } = await evolution.state.create({
  branch: "<isolated-test-branch>",
  message: "Create test-only state"
});
await evolution.state.setData({ state, data: { note: "temporary" } });
return await evolution.state.clearData({ state });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
