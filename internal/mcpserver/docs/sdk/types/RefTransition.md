# RefTransition

Old and new Object identities changed by a single Patch response.

```ts
export interface RefTransition {
  /** Original public Object Ref before a Patch identity change. */
  from: string;
  /** Replacement public Object Ref after that Patch. */
  to: string;
}
```

## Fields

| Name   | Type     | Notes                                                      |
| ------ | -------- | ---------------------------------------------------------- |
| `from` | `string` | Original public Object Ref before a Patch identity change. |
| `to`   | `string` | Replacement public Object Ref after that Patch.            |
