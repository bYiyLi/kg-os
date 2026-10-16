# JsonValue

Supported structured JSON input and output values; BigInt, undefined, and functions are not accepted.

```ts
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
```

## Related types

- `docs.read('sdk/types/JsonObject.md')`
- `docs.read('sdk/types/JsonPrimitive.md')`
