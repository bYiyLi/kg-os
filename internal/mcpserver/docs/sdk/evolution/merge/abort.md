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
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
const s = await evolution.merge.get({ session: "<session-id>" });
return await evolution.merge.abort({ session: s.session, expectedRevision: s.revision });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
