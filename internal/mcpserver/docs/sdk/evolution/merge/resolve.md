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

## Example for kgos_mutate

```js
const s = await evolution.merge.get({ session: "<session-id>" });
return await evolution.merge.resolve({
  session: s.session,
  expectedRevision: s.revision,
  resolutions: [{ conflictId: "<conflict-id>", choice: "ours" }]
});
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
