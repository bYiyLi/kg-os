# EvolutionGetResult

Immutable Commit metadata plus KG OS consistency and mutable State Data.

```ts
export interface EvolutionGetResult extends StateSummary {
  /** Whether this State can be interpreted through KG OS high-level models. */
  consistency: ConsistencyStatus;
  /** Whether mutable State Data is present. */
  hasData: boolean;
  /** JSON-compatible mutable State Data; not part of the versioned graph snapshot. */
  data: JsonValue;
}
```

## Fields

| Name          | Type                | Notes                                                                         |
| ------------- | ------------------- | ----------------------------------------------------------------------------- |
| `consistency` | `ConsistencyStatus` | Whether this State can be interpreted through KG OS high-level models.        |
| `hasData`     | `boolean`           | Whether mutable State Data is present.                                        |
| `data`        | `JsonValue`         | JSON-compatible mutable State Data; not part of the versioned graph snapshot. |

## Related types

- `docs.read('sdk/types/ConsistencyStatus.md')`
- `docs.read('sdk/types/JsonValue.md')`
- `docs.read('sdk/types/StateSummary.md')`
