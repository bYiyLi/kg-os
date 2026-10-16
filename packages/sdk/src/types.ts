/** JSON primitive values accepted by the MCP and HTTP transports. */
export type JsonPrimitive = boolean | null | number | string;

// cspell:words goroutines
/** JSON-compatible map with string keys and recursively valid values. */
export interface JsonObject {
  /** Any string-keyed property with a recursively JSON-compatible value. */
  [key: string]: JsonValue;
}
/** Supported structured JSON input and output values; BigInt, undefined, and functions are not accepted. */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

/** State reference resolved at the start of each read: commit, branch, or tag. */
export type StateRef = `commit/${string}` | `branch/${string}` | `tag/${string}`;
/** Immutable Commit reference returned by KG OS. Commit IDs are 64 lowercase hex digits. */
export type ResolvedState = `commit/${string}`;

/** Transport-only request options; not available as an argument inside the MCP Sandbox. */
export interface RequestOptions {
  /** Optional AbortSignal for the HTTP client transport; not exposed as a Sandbox method argument. */
  signal?: AbortSignal;
}

// The bootstrap endpoint remains available even when the optional UI store
// cannot be opened. Store-specific metadata is supplied once it exists.
/** Current daemon boot identity and optional Web persistence availability. */
export interface WebDataInfoResult {
  /** Ephemeral boot identifier; changes when the daemon restarts. */
  daemonBootId: string;
  /** Whether the Web persistence store is usable in the current process. */
  storageStatus: "ready" | "unavailable" | "unsupported" | "mismatch";
}

// Current-process summary; counters reset whenever kgosd restarts.
/** Aggregate in-process diagnostics; counters reset on every daemon restart. */
export interface SystemDiagnosticsResult {
  /** Seconds since the current kgosd process started. */
  uptime_seconds: number;
  /** Current Go heap allocation in bytes and active goroutine count. */
  process: { heap_alloc_bytes: number; goroutines: number };
  /** HTTP request totals, failures, concurrent requests, and latency buckets. */
  http: {
    requests_total: number;
    non_2xx_total: number;
    in_flight: number;
    latency_ms_buckets: { le_50: number; le_250: number; le_1000: number; over_1000: number };
  };
  /** MCP tool totals, failures, timeouts, and current concurrency. */
  mcp: {
    tool_calls_total: number;
    tool_errors_total: number;
    tool_timeouts_total: number;
    in_flight: number;
  };
  /** Aggregated business operation count and outcome distribution. */
  business: { operations_total: number; outcomes: Record<string, number> };
  /** Number of sandbox resource budget violations in this daemon process. */
  sandbox: { resource_limits_total: number };
}

/** Public KG OS Object categories; not internal Lithograph resource kinds. */
export type ObjectKind =
  | "domain"
  | "node-definition"
  | "relationship-definition"
  | "knowledge-node"
  | "knowledge-relationship";

/** Stable public error envelope with a code, human-readable message, and optional safe details. */
export interface PublicError {
  /** Stable public code distinguishing failure classes. */
  code: string;
  /** Human-readable error explanation; not a Commit message. */
  message: string;
  /** Safe structured public diagnostic details, if available. */
  details?: JsonObject;
}

/** Brief Ontology entry returned inside overview or Domain listings. */
export interface Summary {
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
  /** Declared name of this Ontology resource; the ref is its public identity. */
  name: string;
  /** Optional human-facing title; not an identifying Ref. */
  title?: string;
  /** Optional explanatory text; not a constraint or an ID. */
  description?: string;
  /** Source Node Definition ref for a Relationship Definition. */
  from?: string;
  /** Target Node Definition ref for a Relationship Definition. */
  to?: string;
}

/** Read Ontology overview or selected definitions at one pinned State. */
export interface OntologyReadRequest {
  /** StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>. */
  at: StateRef;
  /** Public Object or Ontology refs to fetch in a single pinned read; each ref must exist in that State. */
  refs?: string[];
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** One Ontology overview, Domain or Definition result with Markdown. */
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

/** Ontology results resolved from the same immutable State. */
export interface OntologyReadResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Requested Ontology views, Domain summaries or Definition views at the same State. */
  results: OntologyReadItem[];
}

/** Batch-read public Object refs from a single State snapshot. */
export interface ObjectReadRequest {
  /** StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>. */
  at: StateRef;
  /** Public Object or Ontology refs to fetch in a single pinned read; each ref must exist in that State. */
  refs: string[];
}

/** One requested Object with its public logical JSON value. */
export interface ObjectReadItem {
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
  /** Public JSON representation of the requested Ontology or Knowledge Object. */
  value: JsonValue;
}

/** Batch Object read result with the immutable resolved State. */
export interface ObjectReadResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Requested public Object values in the same pinned Snapshot. */
  results: ObjectReadItem[];
}

/** One canonical editable YAML body for an Object. */
export interface ObjectTextReadItem {
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
  /** Canonical YAML text for editing; construct a Git Extended Diff from this body. */
  body: string;
}

/** Canonical text results pinned to one State. */
export interface ObjectTextReadResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Requested canonical editable Object YAML bodies in the same pinned Snapshot. */
  results: ObjectTextReadItem[];
}

/** Atomic Git Extended Diff patch against a known base State and explicit target Branch. */
export interface PatchRequest {
  /** Immutable Commit observed before editing; must be commit/<64-lowercase-hex>. A stale base returns STALE_BASE_STATE. */
  baseState: ResolvedState;
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** Canonical Git Extended Diff text. Construct from an observed Object/ Ontology read, not raw SQL. */
  patch: string;
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
}

/** Alias-to-ref mapping for newly created Objects in a Patch. */
export interface CreatedObject {
  /** Request-local alias assigned to a newly created Object. */
  alias: string;
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
}

/** Old and new Object identities changed by a single Patch response. */
export interface RefTransition {
  /** Original public Object Ref before a Patch identity change. */
  from: string;
  /** Replacement public Object Ref after that Patch. */
  to: string;
}

/** Committed State and identifier mappings returned by a successful Patch. */
export interface PatchResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** New Objects with their request aliases and resolved refs. */
  created: CreatedObject[];
  /** Public identity transitions reported by the patch; does not create a permanent alias. */
  transitions: RefTransition[];
}

/** Execute unchanged Cypher against one immutable State using a read-only connection. */
export interface GraphQueryRequest {
  /** StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>. */
  at: StateRef;
  /** Single Lithograph Cypher 25 query passed unchanged; never SQL SELECT lithograph(...) syntax. */
  cypher: string;
  /** Optional JSON-compatible named Cypher parameters, referenced as $name in the query. */
  params?: JsonObject;
}

/** Execute unchanged Cypher on a Branch through a read/write connection. */
export interface GraphExecuteRequest {
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** Single Lithograph Cypher 25 query passed unchanged; never SQL SELECT lithograph(...) syntax. */
  cypher: string;
  /** Optional JSON-compatible named Cypher parameters, referenced as $name in the query. */
  params?: JsonObject;
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
}

/** Column-oriented schema and fully materialized Cypher rows at a resolved State. */
export interface GraphQueryResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Column names in result order; each row uses the corresponding positions. */
  columns: string[];
  /** Materialized rows in column order; prefer streaming for large result sets. */
  rows: JsonValue[][];
}

/** Graph execution result including Lithograph's counters without asserting that a Commit was created. */
export interface GraphExecuteResult extends GraphQueryResult {
  /** Counters returned by the Lithograph execution; not proof of one new Commit. */
  counters: JsonValue;
}

/** First event in a streamed Graph execution: ordered column names. */
export interface GraphColumnsEvent {
  /** Variant tag; Graph streaming events are columns, row or summary. */
  type: "columns";
  /** Column names in result order; each row uses the corresponding positions. */
  columns: string[];
}

/** One streamed row of values corresponding to columns. */
export interface GraphRowEvent {
  /** Variant tag; Graph streaming events are columns, row or summary. */
  type: "row";
  /** One row of JSON-compatible Cypher values in column order. */
  row: JsonValue[];
}

/** Successful final Graph streaming event; a missing summary means success is not confirmed. */
export interface GraphSummaryEvent {
  /** Variant tag; Graph streaming events are columns, row or summary. */
  type: "summary";
  /** Resolved Commit in the successful terminal Graph stream summary. */
  state: ResolvedState;
  /** Counters returned by the Lithograph execution; not proof of one new Commit. */
  counters?: JsonValue;
}

/** Graph streaming union: columns, zero or more rows, then a successful summary. */
export type GraphStreamEvent = GraphColumnsEvent | GraphRowEvent | GraphSummaryEvent;

/** One KG OS Snapshot consistency diagnosis. */
export interface ConsistencyIssue {
  /** Stable public code distinguishing failure classes. */
  code: string;
  /** Explanation of the specific inconsistency in this State. */
  message: string;
}

/** Validity and detailed problems when interpreting a Snapshot as KG OS data. */
export interface ConsistencyStatus {
  /** Validity status for KG OS interpretation of the resolved graph State. */
  status: string;
  /** Consistency problems that prevent interpreting this State as a valid KG OS snapshot. */
  issues: ConsistencyIssue[];
}

/** Immutable Commit identity, parents, author/message and UTC microsecond timestamp. */
export interface StateSummary {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Immutable parent Commit references in ancestry order. */
  parents: ResolvedState[];
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
  /** Commit timestamp in UTC Unix epoch microseconds, not a Date string. */
  committedAt: number;
}

/** Default Branch and its currently resolved State. */
export interface EvolutionOverviewResult {
  /** Current default Branch name (not a StateRef). */
  defaultBranch: string;
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}

/** Resolve and inspect a specific StateRef. */
export interface EvolutionGetRequest {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: StateRef;
}

/** Immutable Commit metadata plus KG OS consistency and mutable State Data. */
export interface EvolutionGetResult extends StateSummary {
  /** Whether this State can be interpreted through KG OS high-level models. */
  consistency: ConsistencyStatus;
  /** Whether mutable State Data is present. */
  hasData: boolean;
  /** JSON-compatible mutable State Data; not part of the versioned graph snapshot. */
  data: JsonValue;
}

/** Page through ancestors of a Branch/Tag/Commit. */
export interface EvolutionAncestryRequest {
  /** StateRef whose reachable history/ancestors are traversed. */
  root: StateRef;
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** Ordered Commit ancestors with continuation cursor. */
export interface EvolutionAncestryResult {
  /** Resolved immutable Commit from which the ancestry walk began. */
  root: ResolvedState;
  /** Items returned for this result or page. */
  items: StateSummary[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** Select one public Object from a pinned anchor State. */
export interface EvolutionObjectFilter {
  /** StateRef at which the filtered Object identity was observed. */
  anchorState: StateRef;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
}

/** Compare two States in a requested public change scope. */
export interface EvolutionDiffRequest {
  /** StateRef resolved to the immutable before-Snapshot. */
  before: StateRef;
  /** StateRef resolved to the immutable after-Snapshot. */
  after: StateRef;
  /** Public history/diff scope: all, ontology, knowledge or object. */
  scope: string;
  /** When scope=object, provide an anchor State and canonical public Object ref. */
  object?: EvolutionObjectFilter;
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** One public Object change at a logical JSON Pointer. */
export interface EvolutionChange {
  /** Logical change kind, such as add, update, delete, rename or restructure. */
  change: string;
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** RFC 6901 JSON Pointer into the public logical Object representation. */
  path: string;
  /** Public Object Ref in the before State if present. */
  beforeRef?: string;
  /** Public Object Ref in the after State if present. */
  afterRef?: string;
  /** Other public Objects affected by the same shared resource change. */
  relatedRefs?: string[];
  /** Public JSON value before this logical Object change, if present. */
  before?: JsonValue;
  /** Public JSON value after this logical Object change, if present. */
  after?: JsonValue;
}

/** Paginated public change set between two resolved States. */
export interface EvolutionDiffResult {
  /** Resolved immutable Commit for the before-Snapshot. */
  before: ResolvedState;
  /** Resolved immutable Commit for the after-Snapshot. */
  after: ResolvedState;
  /** Items returned for this result or page. */
  items: EvolutionChange[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** Find changes reachable from a State, optionally scoped to an Object. */
export interface EvolutionHistoryRequest {
  /** StateRef whose reachable history/ancestors are traversed. */
  root: StateRef;
  /** Public history/diff scope: all, ontology, knowledge or object. */
  scope: string;
  /** When scope=object, provide an anchor State and canonical public Object ref. */
  object?: EvolutionObjectFilter;
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** One State/change pair; a State may contribute several entries. */
export interface EvolutionHistoryEntry {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Immutable parent Commit references in ancestry order. */
  parents: ResolvedState[];
  /** One public change at this Commit; null preserves an explicit no-delta Commit in all-scope history. */
  change: EvolutionChange | null;
}

/** Paginated history entries for a pinned root. */
export interface EvolutionHistoryResult {
  /** Resolved immutable Commit from which history was read. */
  root: ResolvedState;
  /** Items returned for this result or page. */
  items: EvolutionHistoryEntry[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** Create a Commit, even with no graph delta, on an existing Branch. */
export interface StateCreateRequest {
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** Optional mutable JSON State Data to accompany the newly created Commit. */
  data?: JsonValue;
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
}

/** Created immutable Commit reference. */
export interface StateCreateResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}

/** Change mutable State Data without changing the immutable graph/Commit. */
export interface StateSetDataRequest {
  /** StateRef to the existing Commit whose mutable sidecar Data is updated. */
  state: StateRef;
  /** JSON-compatible mutable State Data; not part of the versioned graph snapshot. */
  data: JsonValue;
}

/** Updated mutable State Data for the referenced Commit. */
export interface StateSetDataResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** JSON-compatible mutable State Data; not part of the versioned graph snapshot. */
  data: JsonValue;
}

/** Remove mutable State Data attached to a Commit. */
export interface StateClearDataRequest {
  /** StateRef to the existing Commit whose mutable sidecar Data is cleared. */
  state: StateRef;
}

/** Commit whose mutable State Data was removed. */
export interface StateClearDataResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}

/** Named Branch or Tag and its current resolved Commit. */
export interface EvolutionRefItem {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}

/** List of named Version refs. */
export interface EvolutionRefListResult {
  /** Items returned for this result or page. */
  items: EvolutionRefItem[];
}

/** Create a Branch pointing at an existing Commit/Branch/Tag StateRef. */
export interface BranchCreateRequest {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Source StateRef for creating the Branch; write branch/main, not main. */
  from: StateRef;
}

/** Delete a Branch name without deleting its immutable Commit history. */
export interface BranchDeleteRequest {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
}

/** Result of creating or removing a Branch reference. */
export interface BranchMutationResult {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state?: ResolvedState;
  /** Prior resolved Commit reference, if an existing ref moved. */
  previousState?: ResolvedState;
}

/** Create a Tag pointing at an existing State. */
export interface TagCreateRequest {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Existing target StateRef (commit, branch, or tag) for a Tag. */
  target: StateRef;
}

/** Move an existing Tag to an existing State. */
export interface TagMoveRequest {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Existing target StateRef (commit, branch, or tag) for a Tag. */
  target: StateRef;
}

/** Delete a named Tag reference without removing the Commit. */
export interface TagDeleteRequest {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
}

/** Result of a Tag reference update. */
export interface TagMutationResult {
  /** Name of this Branch, Tag, or public resource. */
  name: string;
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state?: ResolvedState;
  /** Prior resolved Commit reference, if an existing ref moved. */
  previousState?: ResolvedState;
}

/** A resolution uses ours/theirs without a value, or supplies a replacement value. */
export type MergeConflictResolution =
  { choice: "ours" | "theirs"; value?: never } | { choice: "value"; value: JsonValue };
/** Valid conflict choice. */
export type MergeChoice = MergeConflictResolution["choice"];
/** Merge candidate status before finalize. */
export type MergeSessionStatus = "up_to_date" | "fast_forward" | "conflicted" | "ready";
/** Result of finalizing a session. */
export type MergeFinalizeStatus = "up_to_date" | "fast_forward" | "merged";

/** One public merge conflict and any selected resolution. */
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

/** One conflict ID paired with a legal resolution and its required value. */
export type MergeResolution = MergeConflictResolution & { conflictId: string };

/** Identity, source/target States and optimistic revision of a Merge Session. */
export interface MergeSessionSummary {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** Target Branch's pinned resolved Commit for this Merge Session. */
  targetState: ResolvedState;
  /** Resolved source Commit for this Merge Session. */
  sourceState: ResolvedState;
  /** Current optimistic Merge Session revision. */
  revision: number;
}

/** Merge Session plus state of conflict resolution. */
export interface MergeSession extends MergeSessionSummary {
  /** Merge state: up_to_date, fast_forward, conflicted, or ready. */
  status: MergeSessionStatus;
  /** Number of remaining unresolved conflicts. */
  unresolved: number;
}

/** Start a Merge Session against the current Head of a Branch. */
export interface MergeStartRequest {
  /** Existing target Branch name; a plain Branch name, not branch/<name>. */
  branch: string;
  /** StateRef to merge into the target Branch. */
  source: StateRef;
}

/** Paginate open Merge Sessions. */
export interface MergeListRequest {
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** Paginated Merge Session headers. */
export interface MergeListResult {
  /** Items returned for this result or page. */
  items: MergeSessionSummary[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** Fetch an existing Merge Session. */
export interface MergeGetRequest {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
}

/** Paginate conflicts of one Merge Session. */
export interface MergeConflictsRequest {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** Conflict items paired with the current Session revision. */
export interface MergeConflictsResult {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Current optimistic Merge Session revision. */
  revision: number;
  /** Items returned for this result or page. */
  items: MergeConflict[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}

/** Apply conflict resolutions using the observed Merge Session revision. */
export interface MergeResolveRequest {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Revision observed from merge.get/conflicts. Stale revisions are rejected. */
  expectedRevision: number;
  /** Resolutions of individual conflict IDs: ours/theirs without a value, or value with a required replacement. */
  resolutions: MergeResolution[];
}

/** Finalize a ready Merge Session with optimistic revision checking. */
export interface MergeFinalizeRequest {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Revision observed from merge.get/conflicts. Stale revisions are rejected. */
  expectedRevision: number;
  /** Optional author text preserved as Commit metadata when a Commit is created. */
  author?: string;
  /** Optional Commit message; do not assume every operation creates one. */
  message?: string;
}

/** Result of merged, fast-forwarded or already up-to-date finalization. */
export interface MergeFinalizeResult {
  /** Finalization outcome: up_to_date, fast_forward, or merged. */
  status: MergeFinalizeStatus;
  /** Target Branch's pinned resolved Commit for this Merge Session. */
  targetState: ResolvedState;
  /** Resolved source Commit for this Merge Session. */
  sourceState: ResolvedState;
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}

/** Abort an unfinished Merge Session at an expected revision. */
export interface MergeAbortRequest {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Revision observed from merge.get/conflicts. Stale revisions are rejected. */
  expectedRevision: number;
}

/** Identifier of an aborted Merge Session. */
export interface MergeAbortResult {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
}
