# JsonValue

Supported structured JSON input and output values; BigInt, undefined, and functions are not accepted.

```ts
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
```

## Related types

- `sdk/types/JsonObject.md`
- `sdk/types/JsonPrimitive.md`
