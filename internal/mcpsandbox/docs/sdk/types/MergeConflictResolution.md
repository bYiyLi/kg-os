# MergeConflictResolution

A resolution uses ours/theirs without a value, or supplies a replacement value.

```ts
export type MergeConflictResolution =
  { choice: "ours" | "theirs"; value?: never } | { choice: "value"; value: JsonValue };
```

## Related types

- `docs.read('sdk/types/JsonValue.md')`
