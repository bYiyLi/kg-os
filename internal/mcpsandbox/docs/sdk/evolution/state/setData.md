# evolution.state.setData

**Write — kgos_run only**

Replace the mutable JSON State Data on an existing State; no new Commit.

## Signature

```ts
evolution.state.setData(request: StateSetDataRequest): Promise<StateSetDataResult>
```

## Constraints

State Data is a mutable annotation, not part of the versioned Knowledge/Ontology graph.

## Input and return types

- Request: `StateSetDataRequest` — `docs.read('sdk/types/StateSetDataRequest.md')`
- Return: `Promise<StateSetDataResult>`

- `docs.read('sdk/types/StateSetDataResult.md')`

## Example for kgos_run

```js
return await evolution.state.setData({ state: "branch/main", data: { note: "reviewed" } });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
