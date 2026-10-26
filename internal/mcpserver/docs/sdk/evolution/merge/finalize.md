# evolution.merge.finalize

**Write — kgos_mutate only**

Finalize a Merge Session using its current revision; may fast-forward or create a Commit.

## Signature

```ts
evolution.merge.finalize(request: MergeFinalizeRequest): Promise<MergeFinalizeResult>
```

## Constraints

Use the observed Merge Session revision. The Session may be stale after other changes. An actual new merge Commit accepts optional message per guides/evolution.md; fast-forward/up-to-date cannot replace existing Commit messages.

## Input and return types

- Request: `MergeFinalizeRequest` — `sdk/types/MergeFinalizeRequest.md`
- Return: `Promise<MergeFinalizeResult>`

- `sdk/types/MergeFinalizeResult.md`
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
const s = await evolution.merge.get({ session: "<session-id>" });
return await evolution.merge.finalize({ session: s.session, expectedRevision: s.revision });
```

## Related guides

For task context not already established, read `guides/evolution.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
