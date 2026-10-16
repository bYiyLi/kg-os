# graph.query

**Read — kgos_read / kgos_run**

Execute a read-only Cypher query at a State.

## Signature

```ts
graph.query(request: GraphQueryRequest): Promise<GraphQueryResult>
```

## Input and return types

- Request: `GraphQueryRequest` — `docs.read('sdk/types/GraphQueryRequest.md')`
- Return: `Promise<GraphQueryResult>`

- `docs.read('sdk/types/GraphQueryResult.md')`

## Example for kgos_read

```js
return await graph.query({ at: "branch/main", cypher: "MATCH (n) RETURN n LIMIT 10" });
```
