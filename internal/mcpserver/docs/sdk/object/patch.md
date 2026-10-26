# object.patch

**Write — kgos_mutate only**

Atomically apply a Git Extended Diff spanning public Objects.

## Signature

```ts
object.patch(request: PatchRequest): Promise<PatchResult>
```

## Constraints

Use the observed baseState and canonical editable Object text to construct the patch. Optional new Commit messages follow guides/evolution.md: describe the world's known purpose and actual change, then read back the returned State.

## Input and return types

- Request: `PatchRequest` — `sdk/types/PatchRequest.md`
- Return: `Promise<PatchResult>`

- `sdk/types/PatchResult.md`
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
const branch = "<authorized-target-branch>";
const { state } = await evolution.get({ state: `branch/${branch}` });
return await object.patch({ branch, baseState: state, patch: "<git-extended-diff>" });
```

## Related guides

For task context not already established, read `guides/objects.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
