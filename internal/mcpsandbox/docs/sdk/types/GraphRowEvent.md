# GraphRowEvent

One streamed row of values corresponding to columns.

```ts
export interface GraphRowEvent {
  /** Variant tag; Graph streaming events are columns, row or summary. */
  type: "row";
  /** One row of JSON-compatible Cypher values in column order. */
  row: JsonValue[];
}
```

## Fields

| Name   | Type          | Notes                                                            |
| ------ | ------------- | ---------------------------------------------------------------- |
| `type` | `"row"`       | Variant tag; Graph streaming events are columns, row or summary. |
| `row`  | `JsonValue[]` | One row of JSON-compatible Cypher values in column order.        |

## Related types

- `docs.read('sdk/types/JsonValue.md')`
