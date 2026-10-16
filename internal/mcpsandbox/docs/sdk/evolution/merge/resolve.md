# evolution.merge.resolve

**Write — kgos_run only**

Apply conflict resolutions using the observed Session revision.

## Signature

```ts
evolution.merge.resolve(request: MergeResolveRequest): Promise<MergeSession>
```

## Constraints

Use the current Merge Session revision, and choose resolutions based on the observed conflicts; 'ours' is only an illustrative choice.

## Input and return types

- Request: `MergeResolveRequest` — `docs.read('sdk/types/MergeResolveRequest.md')`
- Return: `Promise<MergeSession>`

- `docs.read('sdk/types/MergeSession.md')`

## Example for kgos_run

```js
const s = await evolution.merge.get({ session: "<session-id>" });
return await evolution.merge.resolve({
  session: s.session,
  expectedRevision: s.revision,
  resolutions: [{ conflictId: "<conflict-id>", choice: "ours" }]
});
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
