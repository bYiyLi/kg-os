# graph.streamExecute

**Write — kgos_mutate only**

Stream Cypher execution on a writable Branch.

## Signature

```ts
graph.streamExecute(request: GraphExecuteRequest): AsyncGenerator<GraphStreamEvent, void, void>
```

## Constraints

Rows or columns alone do not confirm success; inspect the terminal summary or error. For new Commit messages follow guides/evolution.md and read back the State.

## Input and return types

- Request: `GraphExecuteRequest` — `sdk/types/GraphExecuteRequest.md`
- Return: `AsyncGenerator<GraphStreamEvent, void, void>`

- `sdk/types/GraphStreamEvent.md`
  **Before writing:** Use explicit authorization and an observed target/revision. Know the applicable transaction and recovery contract in `guides/errors.md`; reuse it when already read for this version. A later failure, timeout or cancellation does not prove earlier mutations rolled back.

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

## Related guides

For task context not already established, read `guides/graph.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
Before consuming a stream, know the completion and cancellation contract in `guides/errors.md`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
