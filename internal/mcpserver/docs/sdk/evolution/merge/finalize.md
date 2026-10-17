# evolution.merge.finalize

**Write — kgos_mutate only**

Finalize a Merge Session using its current revision; may fast-forward or create a Commit.

## Signature

```ts
evolution.merge.finalize(request: MergeFinalizeRequest): Promise<MergeFinalizeResult>
```

## Constraints

Use the observed Merge Session revision. The Session may be stale after other changes.

## Input and return types

- Request: `MergeFinalizeRequest` — `sdk/types/MergeFinalizeRequest.md`
- Return: `Promise<MergeFinalizeResult>`

- `sdk/types/MergeFinalizeResult.md`

## Example for kgos_mutate

```js
const s = await evolution.merge.get({ session: "<session-id>" });
return await evolution.merge.finalize({ session: s.session, expectedRevision: s.revision });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
