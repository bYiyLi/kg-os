# MergeConflict

One public merge conflict and any selected resolution.

```ts
export interface MergeConflict {
  /** Stable public identifier of one outstanding Merge conflict. */
  conflictId: string;
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** RFC 6901 logical conflict slot (not a patch to submit as a mutation). */
  path: string;
  /** Object ref from the common ancestor State, if present. */
  baseRef?: string;
  /** Conflicting Object ref from the target Branch side, if present. */
  oursRef?: string;
  /** Conflicting Object ref from the source State side, if present. */
  theirsRef?: string;
  /** Other public Objects affected by the same shared resource change. */
  relatedRefs?: string[];
  /** Candidate value from the common-ancestor State, if present. */
  base?: JsonValue;
  /** Candidate value from the target Branch side. */
  ours?: JsonValue;
  /** Candidate value from the source State side. */
  theirs?: JsonValue;
  /** Resolution selected for this conflict, if any. */
  resolution?: MergeConflictResolution;
}
```

## Fields

| Name           | Type                      | Notes                                                                             |
| -------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `conflictId`   | `string`                  | Stable public identifier of one outstanding Merge conflict.                       |
| `kind`         | `ObjectKind`              | Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. |
| `path`         | `string`                  | RFC 6901 logical conflict slot (not a patch to submit as a mutation).             |
| `baseRef?`     | `string`                  | Object ref from the common ancestor State, if present.                            |
| `oursRef?`     | `string`                  | Conflicting Object ref from the target Branch side, if present.                   |
| `theirsRef?`   | `string`                  | Conflicting Object ref from the source State side, if present.                    |
| `relatedRefs?` | `string[]`                | Other public Objects affected by the same shared resource change.                 |
| `base?`        | `JsonValue`               | Candidate value from the common-ancestor State, if present.                       |
| `ours?`        | `JsonValue`               | Candidate value from the target Branch side.                                      |
| `theirs?`      | `JsonValue`               | Candidate value from the source State side.                                       |
| `resolution?`  | `MergeConflictResolution` | Resolution selected for this conflict, if any.                                    |

## Related types

- `docs.read('sdk/types/JsonValue.md')`
- `docs.read('sdk/types/MergeConflictResolution.md')`
- `docs.read('sdk/types/ObjectKind.md')`
