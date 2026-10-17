# OntologyReadItem

One Ontology overview, Domain or Definition result with Markdown.

```ts
export interface OntologyReadItem {
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref?: string;
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: string;
  /** Optional human-facing title; not an identifying Ref. */
  title?: string;
  /** Optional explanatory text; not a constraint or an ID. */
  description?: string;
  /** Items returned for this result or page. */
  items: Summary[];
  /** Total count within the represented Ontology scope. */
  total: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
  /** Human-readable Markdown rendering of this Ontology view. */
  markdown: string;
}
```

## Fields

| Name           | Type        | Notes                                                                                       |
| -------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `ref?`         | `string`    | Canonical public Object identity. Do not treat a mutable title or business key as identity. |
| `kind`         | `string`    | Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements.           |
| `title?`       | `string`    | Optional human-facing title; not an identifying Ref.                                        |
| `description?` | `string`    | Optional explanatory text; not a constraint or an ID.                                       |
| `items`        | `Summary[]` | Items returned for this result or page.                                                     |
| `total`        | `number`    | Total count within the represented Ontology scope.                                          |
| `cursor?`      | `string`    | Opaque continuation token returned by a preceding page; reuse the same query context.       |
| `markdown`     | `string`    | Human-readable Markdown rendering of this Ontology view.                                    |

## Related types

- `sdk/types/Summary.md`
