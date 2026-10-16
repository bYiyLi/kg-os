# evolution.merge.abort

**Write — kgos_run only**

Abort an unfinished Merge Session at its current revision.

## Signature

```ts
evolution.merge.abort(request: MergeAbortRequest): Promise<MergeAbortResult>
```

## Constraints

Use the observed Merge Session revision. Aborting a Session does not undo previous commits.

## Input and return types

- Request: `MergeAbortRequest` — `docs.read('sdk/types/MergeAbortRequest.md')`
- Return: `Promise<MergeAbortResult>`

- `docs.read('sdk/types/MergeAbortResult.md')`

## Example for kgos_run

```js
const s = await evolution.merge.get({ session: "<session-id>" });
return await evolution.merge.abort({ session: s.session, expectedRevision: s.revision });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
