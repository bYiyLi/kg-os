# graph.streamQuery

**Read — kgos_read / kgos_run**

Stream read-only Cypher columns, rows, and final summary.

## Signature

```ts
graph.streamQuery(request: GraphQueryRequest): AsyncGenerator<GraphStreamEvent, void, void>
```

## Input and return types

- Request: `GraphQueryRequest` — `docs.read('sdk/types/GraphQueryRequest.md')`
- Return: `AsyncGenerator<GraphStreamEvent, void, void>`

- `docs.read('sdk/types/GraphStreamEvent.md')`

## Example for kgos_read

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
