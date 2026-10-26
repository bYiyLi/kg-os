# evolution.merge.resolve

**Write — kgos_mutate only**

Apply conflict resolutions using the observed Session revision.

## Signature

```ts
evolution.merge.resolve(request: MergeResolveRequest): Promise<MergeSession>
```

## Constraints

Use the current Merge Session revision, and choose resolutions based on the observed conflicts; 'ours' is only an illustrative choice.

## Input and return types

- Request: `MergeResolveRequest` — `sdk/types/MergeResolveRequest.md`
- Return: `Promise<MergeSession>`

- `sdk/types/MergeSession.md`
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
const s = await evolution.merge.get({ session: "<session-id>" });
return await evolution.merge.resolve({
  session: s.session,
  expectedRevision: s.revision,
  resolutions: [{ conflictId: "<conflict-id>", choice: "ours" }]
});
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
