# ontology.patch

**Write — kgos_run only**

Apply an Ontology-scoped Git Extended Diff to a Branch.

## Signature

```ts
ontology.patch(request: PatchRequest): Promise<PatchResult>
```

## Constraints

Use the observed baseState and canonical editable Object text to construct the patch.

## Input and return types

- Request: `PatchRequest` — `docs.read('sdk/types/PatchRequest.md')`
- Return: `Promise<PatchResult>`

- `docs.read('sdk/types/PatchResult.md')`

## Example for kgos_run

```js
const { state } = await evolution.overview();
return await ontology.patch({
  branch: "<target-branch>",
  baseState: state,
  patch: "<git-extended-diff>"
});
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
