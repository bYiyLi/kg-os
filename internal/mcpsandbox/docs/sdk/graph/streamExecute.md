# graph.streamExecute

**Write — kgos_run only**

Stream Cypher execution on a writable Branch.

## Signature

```ts
graph.streamExecute(request: GraphExecuteRequest): AsyncGenerator<GraphStreamEvent, void, void>
```

## Constraints

Rows or columns alone do not confirm success; inspect the terminal summary or error.

## Input and return types

- Request: `GraphExecuteRequest` — `docs.read('sdk/types/GraphExecuteRequest.md')`
- Return: `AsyncGenerator<GraphStreamEvent, void, void>`

- `docs.read('sdk/types/GraphStreamEvent.md')`

## Example for kgos_run

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
