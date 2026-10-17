# evolution.merge.abort

**Write — kgos_mutate only**

Abort an unfinished Merge Session at its current revision.

## Signature

```ts
evolution.merge.abort(request: MergeAbortRequest): Promise<MergeAbortResult>
```

## Constraints

Use the observed Merge Session revision. Aborting a Session does not undo previous commits.

## Input and return types

- Request: `MergeAbortRequest` — `sdk/types/MergeAbortRequest.md`
- Return: `Promise<MergeAbortResult>`

- `sdk/types/MergeAbortResult.md`

## Example for kgos_mutate

```js
const s = await evolution.merge.get({ session: "<session-id>" });
return await evolution.merge.abort({ session: s.session, expectedRevision: s.revision });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
