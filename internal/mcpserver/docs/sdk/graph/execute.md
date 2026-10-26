# graph.execute

**Write — kgos_mutate only**

Execute Cypher on a writable Branch; its effect depends on the statement.

## Signature

```ts
graph.execute(request: GraphExecuteRequest): Promise<GraphExecuteResult>
```

## Constraints

Cypher is passed through unchanged. Execute does not guarantee a new Commit; when an authorized write creates one, use optional message per guides/evolution.md and verify its State.

## Input and return types

- Request: `GraphExecuteRequest` — `sdk/types/GraphExecuteRequest.md`
- Return: `Promise<GraphExecuteResult>`

- `sdk/types/GraphExecuteResult.md`
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Example for kgos_mutate

```js
return await graph.execute({
  branch: "<target-branch>",
  cypher: "MATCH (n) RETURN count(n) AS count"
});
```

## Related guides

For task context not already established, read `guides/graph.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
