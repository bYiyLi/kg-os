# JsonObject

JSON-compatible map with string keys and recursively valid values.

```ts
export interface JsonObject {
  /** Any string-keyed property with a recursively JSON-compatible value. */
  [key: string]: JsonValue;
}
```

## Fields

| Name            | Type        | Notes                                                               |
| --------------- | ----------- | ------------------------------------------------------------------- |
| `[key: string]` | `JsonValue` | Any string-keyed property with a recursively JSON-compatible value. |

## Related types

- `docs.read('sdk/types/JsonValue.md')`
