# evolution.merge.start

**Write — kgos_mutate only**

Start a Merge Session for an existing target Branch and source State.

## Signature

```ts
evolution.merge.start(request: MergeStartRequest): Promise<MergeSession>
```

## Input and return types

- Request: `MergeStartRequest` — `sdk/types/MergeStartRequest.md`
- Return: `Promise<MergeSession>`

- `sdk/types/MergeSession.md`

## Example for kgos_mutate

```js
return await evolution.merge.start({ branch: "<target-branch>", source: "branch/main" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/evolution.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
