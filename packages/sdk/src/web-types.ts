import type { GraphQueryResult, JsonObject, PublicError } from "./types.js";

export type WebRecordKind = "workspace" | "editor" | "frame" | "query" | "draft";

export interface WebStoreInfo {
  daemonBootId: string;
  storageStatus: "ready" | "unavailable" | "unsupported" | "mismatch";
  formatVersion?: number;
  storeId?: string;
  databaseId?: string;
  currentDatabaseId?: string;
  bindingStatus?: "matched" | "mismatch";
  usage?: { logicalBytes: number; databaseBytes: number; walBytes: number; cacheBytes: number };
  error?: PublicError;
}

export interface WebRecordHeader {
  kind: WebRecordKind;
  id: string;
  revision: string;
  deleted: boolean;
  lastMutationId: string;
}

export interface WebRecord extends WebRecordHeader {
  data: JsonObject | null;
}

export interface WebListRequest {
  storeId: string;
  kind: WebRecordKind;
  limit?: number;
  cursor?: string;
}

export interface WebListResult {
  items: WebRecordHeader[];
  cursor?: string;
}

export interface WebReadRequest {
  storeId: string;
  kind: WebRecordKind;
  id: string;
}

export interface WebDeleteRequest extends WebReadRequest {
  expectedRevision: string;
  mutationId: string;
}

export interface WebSaveRequest extends WebReadRequest {
  expectedRevision: string | null;
  mutationId: string;
  data: JsonObject;
}

export interface WebCacheResult extends GraphQueryResult {
  valueEncoding: "lithograph-json-v1";
}

export interface WebCacheReadRequest {
  storeId: string;
  frameId: string;
}

export interface WebCacheWriteRequest extends WebCacheReadRequest {
  frameRevision: string;
  result: WebCacheResult;
}

export interface WebCacheReadResult {
  hit: boolean;
  result?: WebCacheResult;
}
