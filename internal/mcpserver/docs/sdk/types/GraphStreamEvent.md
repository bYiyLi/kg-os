# GraphStreamEvent

Graph streaming union: columns, zero or more rows, then a successful summary.

```ts
export type GraphStreamEvent = GraphColumnsEvent | GraphRowEvent | GraphSummaryEvent;
```

## Related types

- `sdk/types/GraphColumnsEvent.md`
- `sdk/types/GraphRowEvent.md`
- `sdk/types/GraphSummaryEvent.md`
