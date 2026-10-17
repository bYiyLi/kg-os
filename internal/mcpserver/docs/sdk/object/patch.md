# object.patch

**Write — kgos_mutate only**

Atomically apply a Git Extended Diff spanning public Objects.

## Signature

```ts
object.patch(request: PatchRequest): Promise<PatchResult>
```

## Constraints

Use the observed baseState and canonical editable Object text to construct the patch.

## Input and return types

- Request: `PatchRequest` — `sdk/types/PatchRequest.md`
- Return: `Promise<PatchResult>`

- `sdk/types/PatchResult.md`

## Example for kgos_mutate

```js
const branch = "<authorized-target-branch>";
const { state } = await evolution.get({ state: `branch/${branch}` });
return await object.patch({ branch, baseState: state, patch: "<git-extended-diff>" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/objects.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
