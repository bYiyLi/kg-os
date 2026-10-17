# graph.streamQuery

**Read — kgos_query / kgos_mutate**

Stream read-only Cypher columns, rows, and final summary.

## Signature

```ts
graph.streamQuery(request: GraphQueryRequest): AsyncGenerator<GraphStreamEvent, void, void>
```

## Input and return types

- Request: `GraphQueryRequest` — `sdk/types/GraphQueryRequest.md`
- Return: `AsyncGenerator<GraphStreamEvent, void, void>`

- `sdk/types/GraphStreamEvent.md`

## Example for kgos_query

```js
const rows = [];
for await (const event of graph.streamQuery({
  at: "branch/main",
  cypher: "MATCH (n) RETURN n LIMIT 10"
})) {
  if (event.type === "row") rows.push(event.row);
}
return rows;
```

## Related guides

First read `guides/graph.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
