# evolution.state.clearData

**Write — kgos_run only**

Remove a State's mutable Data annotation; no new Commit.

## Signature

```ts
evolution.state.clearData(request: StateClearDataRequest): Promise<StateClearDataResult>
```

## Constraints

State Data is a mutable annotation, not part of the versioned Knowledge/Ontology graph.

## Input and return types

- Request: `StateClearDataRequest` — `docs.read('sdk/types/StateClearDataRequest.md')`
- Return: `Promise<StateClearDataResult>`

- `docs.read('sdk/types/StateClearDataResult.md')`

## Example for kgos_run

```js
return await evolution.state.clearData({ state: "branch/main" });
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
