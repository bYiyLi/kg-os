# graph.query

**Read — kgos_query / kgos_mutate**

Execute a read-only Cypher query at a State.

## Signature

```ts
graph.query(request: GraphQueryRequest): Promise<GraphQueryResult>
```

## Input and return types

- Request: `GraphQueryRequest` — `sdk/types/GraphQueryRequest.md`
- Return: `Promise<GraphQueryResult>`

- `sdk/types/GraphQueryResult.md`

## Example for kgos_query

```js
return await graph.query({ at: "branch/main", cypher: "MATCH (n) RETURN n LIMIT 10" });
```

## Related guides

For task context not already established, read `guides/graph.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
