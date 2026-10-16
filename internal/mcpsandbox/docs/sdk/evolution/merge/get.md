# evolution.merge.get

**Read — kgos_read / kgos_run**

Read the current status and revision of a Merge Session.

## Signature

```ts
evolution.merge.get(request: MergeGetRequest): Promise<MergeSession>
```

## Input and return types

- Request: `MergeGetRequest` — `docs.read('sdk/types/MergeGetRequest.md')`
- Return: `Promise<MergeSession>`

- `docs.read('sdk/types/MergeSession.md')`

## Example for kgos_read

```js
return await evolution.merge.get({ session: "<session-id>" });
```
