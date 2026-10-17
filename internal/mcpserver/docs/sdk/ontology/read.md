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

First read `guides/ontology.md` and `guides/errors.md` with `kgos_docs`.
To read a type page, call the separate MCP Tool `kgos_docs` with `{"paths":["sdk/types/<Type>.md"]}`; do not put this in JavaScript.
