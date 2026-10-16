# GraphColumnsEvent

First event in a streamed Graph execution: ordered column names.

```ts
export interface GraphColumnsEvent {
  /** Variant tag; Graph streaming events are columns, row or summary. */
  type: "columns";
  /** Column names in result order; each row uses the corresponding positions. */
  columns: string[];
}
```

## Fields

| Name      | Type        | Notes                                                                    |
| --------- | ----------- | ------------------------------------------------------------------------ |
| `type`    | `"columns"` | Variant tag; Graph streaming events are columns, row or summary.         |
| `columns` | `string[]`  | Column names in result order; each row uses the corresponding positions. |
