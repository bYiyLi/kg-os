# evolution.state.create

**Write — kgos_mutate only**

Create a new Commit/State on an existing Branch, even without graph changes.

## Signature

```ts
evolution.state.create(request: StateCreateRequest): Promise<StateCreateResult>
```

## Constraints

Creates a Commit even without graph changes. Use optional message per guides/evolution.md and read back via evolution.get; never make an empty Commit just to repair an old message.

## Input and return types

- Request: `StateCreateRequest` — `sdk/types/StateCreateRequest.md`
- Return: `Promise<StateCreateResult>`

- `sdk/types/StateCreateResult.md`
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
return await evolution.state.create({ branch: "<target-branch>", message: "Create a checkpoint" });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
