# GraphStreamEvent

Graph streaming union: columns, zero or more rows, then a successful summary.

```ts
export type GraphStreamEvent = GraphColumnsEvent | GraphRowEvent | GraphSummaryEvent;
```

## Related types

- `docs.read('sdk/types/GraphColumnsEvent.md')`
- `docs.read('sdk/types/GraphRowEvent.md')`
- `docs.read('sdk/types/GraphSummaryEvent.md')`
