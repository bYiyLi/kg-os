/** A persisted OTel stage. Missing end time means incomplete, not failed. */
export interface ObservabilitySpan {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  request_id?: string;
  operation_id?: string;
  name: string;
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
  outcome: string;
  /** Fixed database call family; never contains SQL, Cypher, or parameters. */
  query_family?: string;
  /** Monotonic call order within a single Kernel operation, when available. */
  db_call_seq?: number;
}
