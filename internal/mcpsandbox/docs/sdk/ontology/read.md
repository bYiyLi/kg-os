# ontology.read

**Read — kgos_read / kgos_run**

Read Ontology overview, domains, or definitions at a State.

## Signature

```ts
ontology.read(request: OntologyReadRequest): Promise<OntologyReadResult>
```

## Input and return types

- Request: `OntologyReadRequest` — `docs.read('sdk/types/OntologyReadRequest.md')`
- Return: `Promise<OntologyReadResult>`

- `docs.read('sdk/types/OntologyReadResult.md')`

## Example for kgos_read

```js
return await ontology.read({ at: "branch/main" });
```
