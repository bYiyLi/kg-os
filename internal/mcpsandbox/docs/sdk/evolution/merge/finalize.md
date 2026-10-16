# evolution.merge.finalize

**Write — kgos_run only**

Finalize a Merge Session using its current revision; may fast-forward or create a Commit.

## Signature

```ts
evolution.merge.finalize(request: MergeFinalizeRequest): Promise<MergeFinalizeResult>
```

## Constraints

Use the observed Merge Session revision. The Session may be stale after other changes.

## Input and return types

- Request: `MergeFinalizeRequest` — `docs.read('sdk/types/MergeFinalizeRequest.md')`
- Return: `Promise<MergeFinalizeResult>`

- `docs.read('sdk/types/MergeFinalizeResult.md')`

## Example for kgos_run

```js
const s = await evolution.merge.get({ session: "<session-id>" });
return await evolution.merge.finalize({ session: s.session, expectedRevision: s.revision });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
