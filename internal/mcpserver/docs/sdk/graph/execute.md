# graph.execute

**Write — kgos_mutate only**

Execute Cypher on a writable Branch; its effect depends on the statement.

## Signature

```ts
graph.execute(request: GraphExecuteRequest): Promise<GraphExecuteResult>
```

## Constraints

Cypher is passed through unchanged. Calling execute does not guarantee that a new Commit is created.

## Input and return types

- Request: `GraphExecuteRequest` — `sdk/types/GraphExecuteRequest.md`
- Return: `Promise<GraphExecuteResult>`

- `sdk/types/GraphExecuteResult.md`

## Example for kgos_mutate

```js
return await graph.execute({
  branch: "<target-branch>",
  cypher: "MATCH (n) RETURN count(n) AS count"
});
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/graph.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
