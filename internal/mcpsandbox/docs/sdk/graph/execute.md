# graph.execute

**Write — kgos_run only**

Execute Cypher on a writable Branch; its effect depends on the statement.

## Signature

```ts
graph.execute(request: GraphExecuteRequest): Promise<GraphExecuteResult>
```

## Constraints

Cypher is passed through unchanged. Calling execute does not guarantee that a new Commit is created.

## Input and return types

- Request: `GraphExecuteRequest` — `docs.read('sdk/types/GraphExecuteRequest.md')`
- Return: `Promise<GraphExecuteResult>`

- `docs.read('sdk/types/GraphExecuteResult.md')`

## Example for kgos_run

```js
return await graph.execute({
  branch: "<target-branch>",
  cypher: "MATCH (n) RETURN count(n) AS count"
});
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.
