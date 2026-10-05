export type JsonPrimitive = boolean | null | number | string;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface RequestOptions {
  signal?: AbortSignal;
}

export type ObjectKind =
  | "domain"
  | "node-definition"
  | "relationship-definition"
  | "knowledge-node"
  | "knowledge-relationship";

export interface PublicError {
  code: string;
  message: string;
  details?: JsonObject;
}

export interface Summary {
  kind: ObjectKind;
  ref: string;
  name: string;
  title?: string;
  description?: string;
  from?: string;
  to?: string;
}

export interface OntologyReadRequest {
  at: string;
  refs?: string[];
  limit?: number;
  cursor?: string;
}

export interface OntologyReadItem {
  ref?: string;
  kind: string;
  title?: string;
  description?: string;
  items: Summary[];
  total: number;
  cursor?: string;
  markdown: string;
}

export interface OntologyReadResult {
  state: string;
  results: OntologyReadItem[];
}

export interface ObjectReadRequest {
  at: string;
  refs: string[];
}

export interface ObjectReadItem {
  kind: ObjectKind;
  ref: string;
  value: JsonValue;
}

export interface ObjectReadResult {
  state: string;
  results: ObjectReadItem[];
}

export interface ObjectTextReadItem {
  kind: ObjectKind;
  ref: string;
  body: string;
}

export interface ObjectTextReadResult {
  state: string;
  results: ObjectTextReadItem[];
}

export interface PatchRequest {
  baseState: string;
  branch: string;
  patch: string;
  author?: string;
  message?: string;
}

export interface CreatedObject {
  alias: string;
  kind: ObjectKind;
  ref: string;
}

export interface RefTransition {
  from: string;
  to: string;
}

export interface PatchResult {
  state: string;
  created: CreatedObject[];
  transitions: RefTransition[];
}

export interface GraphQueryRequest {
  at: string;
  cypher: string;
  params?: JsonObject;
}

export interface GraphExecuteRequest {
  branch: string;
  cypher: string;
  params?: JsonObject;
  author?: string;
  message?: string;
}

export interface GraphQueryResult {
  state: string;
  columns: string[];
  rows: JsonValue[][];
}

export interface GraphExecuteResult extends GraphQueryResult {
  counters: JsonValue;
}

export interface GraphColumnsEvent {
  type: "columns";
  columns: string[];
}

export interface GraphRowEvent {
  type: "row";
  row: JsonValue[];
}

export interface GraphSummaryEvent {
  type: "summary";
  state: string;
  counters?: JsonValue;
}

export type GraphStreamEvent = GraphColumnsEvent | GraphRowEvent | GraphSummaryEvent;

export interface ConsistencyIssue {
  code: string;
  message: string;
}

export interface ConsistencyStatus {
  status: string;
  issues: ConsistencyIssue[];
}

export interface StateSummary {
  state: string;
  parents: string[];
  author?: string;
  message?: string;
  committedAt: number;
}

export interface EvolutionOverviewResult {
  defaultBranch: string;
  state: string;
}

export interface EvolutionGetRequest {
  state: string;
}

export interface EvolutionGetResult extends StateSummary {
  consistency: ConsistencyStatus;
  hasData: boolean;
  data: JsonValue;
}

export interface EvolutionAncestryRequest {
  root: string;
  limit?: number;
  cursor?: string;
}

export interface EvolutionAncestryResult {
  root: string;
  items: StateSummary[];
  cursor?: string;
}

export interface EvolutionObjectFilter {
  anchorState: string;
  ref: string;
}

export interface EvolutionDiffRequest {
  before: string;
  after: string;
  scope: string;
  object?: EvolutionObjectFilter;
  limit?: number;
  cursor?: string;
}

export interface EvolutionChange {
  change: string;
  kind: ObjectKind;
  path: string;
  beforeRef?: string;
  afterRef?: string;
  relatedRefs?: string[];
  before?: JsonValue;
  after?: JsonValue;
}

export interface EvolutionDiffResult {
  before: string;
  after: string;
  items: EvolutionChange[];
  cursor?: string;
}

export interface EvolutionHistoryRequest {
  root: string;
  scope: string;
  object?: EvolutionObjectFilter;
  limit?: number;
  cursor?: string;
}

export interface EvolutionHistoryEntry {
  state: string;
  parents: string[];
  change: EvolutionChange | null;
}

export interface EvolutionHistoryResult {
  root: string;
  items: EvolutionHistoryEntry[];
  cursor?: string;
}

export interface StateCreateRequest {
  branch: string;
  data?: JsonValue;
  author?: string;
  message?: string;
}

export interface StateCreateResult {
  state: string;
}

export interface StateSetDataRequest {
  state: string;
  data: JsonValue;
}

export interface StateSetDataResult {
  state: string;
  data: JsonValue;
}

export interface StateClearDataRequest {
  state: string;
}

export interface StateClearDataResult {
  state: string;
}

export interface EvolutionRefItem {
  name: string;
  state: string;
}

export interface EvolutionRefListResult {
  items: EvolutionRefItem[];
}

export interface BranchCreateRequest {
  name: string;
  from: string;
}

export interface BranchDeleteRequest {
  name: string;
}

export interface BranchMutationResult {
  name: string;
  state?: string;
  previousState?: string;
}

export interface TagCreateRequest {
  name: string;
  target: string;
}

export interface TagMoveRequest {
  name: string;
  target: string;
}

export interface TagDeleteRequest {
  name: string;
}

export interface TagMutationResult {
  name: string;
  state?: string;
  previousState?: string;
}

export interface MergeConflictResolution {
  choice: string;
  value?: JsonValue;
}

export interface MergeConflict {
  conflictId: string;
  kind: ObjectKind;
  path: string;
  baseRef?: string;
  oursRef?: string;
  theirsRef?: string;
  relatedRefs?: string[];
  base?: JsonValue;
  ours?: JsonValue;
  theirs?: JsonValue;
  resolution?: MergeConflictResolution;
}

export interface MergeResolution {
  conflictId: string;
  choice: string;
  value?: JsonValue;
}

export interface MergeSessionSummary {
  session: string;
  branch: string;
  targetState: string;
  sourceState: string;
  revision: number;
}

export interface MergeSession extends MergeSessionSummary {
  status: string;
  unresolved: number;
}

export interface MergeStartRequest {
  branch: string;
  source: string;
}

export interface MergeListRequest {
  limit?: number;
  cursor?: string;
}

export interface MergeListResult {
  items: MergeSessionSummary[];
  cursor?: string;
}

export interface MergeGetRequest {
  session: string;
}

export interface MergeConflictsRequest {
  session: string;
  limit?: number;
  cursor?: string;
}

export interface MergeConflictsResult {
  session: string;
  revision: number;
  items: MergeConflict[];
  cursor?: string;
}

export interface MergeResolveRequest {
  session: string;
  expectedRevision: number;
  resolutions: MergeResolution[];
}

export interface MergeFinalizeRequest {
  session: string;
  expectedRevision: number;
  author?: string;
  message?: string;
}

export interface MergeFinalizeResult {
  status: string;
  targetState: string;
  sourceState: string;
  state: string;
}

export interface MergeAbortRequest {
  session: string;
  expectedRevision: number;
}

export interface MergeAbortResult {
  session: string;
}
