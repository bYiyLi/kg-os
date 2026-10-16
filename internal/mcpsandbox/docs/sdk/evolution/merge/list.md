# evolution.merge.list

**Read — kgos_read / kgos_run**

List Merge Sessions with optional pagination.

## Signature

```ts
evolution.merge.list(request?: MergeListRequest): Promise<MergeListResult>
```

## Input and return types

- Request: `MergeListRequest` — `docs.read('sdk/types/MergeListRequest.md')`
- Return: `Promise<MergeListResult>`

- `docs.read('sdk/types/MergeListResult.md')`

## Example for kgos_read

```js
return await evolution.merge.list({ limit: 20 });
```
