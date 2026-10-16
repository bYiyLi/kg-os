# evolution.merge.start

**Write — kgos_run only**

Start a Merge Session for an existing target Branch and source State.

## Signature

```ts
evolution.merge.start(request: MergeStartRequest): Promise<MergeSession>
```

## Input and return types

- Request: `MergeStartRequest` — `docs.read('sdk/types/MergeStartRequest.md')`
- Return: `Promise<MergeSession>`

- `docs.read('sdk/types/MergeSession.md')`

## Example for kgos_run

```js
return await evolution.merge.start({ branch: "<target-branch>", source: "branch/main" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
