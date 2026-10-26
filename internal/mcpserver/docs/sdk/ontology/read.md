# ontology.read

**Read — kgos_query / kgos_mutate**

Read Ontology overview, domains, or definitions at a State.

## Signature

```ts
ontology.read(request: OntologyReadRequest): Promise<OntologyReadResult>
```

## Input and return types

- Request: `OntologyReadRequest` — `sdk/types/OntologyReadRequest.md`
- Return: `Promise<OntologyReadResult>`

- `sdk/types/OntologyReadResult.md`

## Example for kgos_query

```js
return await ontology.read({ at: "branch/main" });
```

## Related guides

For task context not already established, read `guides/reading.md` with `kgos_docs`; reuse current-version documents already read, without returning to an index.
For a failure or uncertain result, consult `guides/errors.md`; non-streaming tasks need no streaming method pages.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
