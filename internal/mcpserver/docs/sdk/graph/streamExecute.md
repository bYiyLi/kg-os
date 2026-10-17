# graph.streamExecute

**Write — kgos_mutate only**

Stream Cypher execution on a writable Branch.

## Signature

```ts
graph.streamExecute(request: GraphExecuteRequest): AsyncGenerator<GraphStreamEvent, void, void>
```

## Constraints

Rows or columns alone do not confirm success; inspect the terminal summary or error.

## Input and return types

- Request: `GraphExecuteRequest` — `sdk/types/GraphExecuteRequest.md`
- Return: `AsyncGenerator<GraphStreamEvent, void, void>`

- `sdk/types/GraphStreamEvent.md`

## Example for kgos_mutate

```js
const events = [];
for await (const event of graph.streamExecute({
  branch: "<target-branch>",
  cypher: "MATCH (n) RETURN count(n)"
}))
  events.push(event);
return events;
```

**Write safety:** Use only with explicit authorization and observed target/revision. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

## Related guides

First read `guides/graph.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
