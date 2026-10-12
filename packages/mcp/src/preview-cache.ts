import { randomUUID } from "node:crypto";
import type { KGOSClient } from "@kgos/sdk";
import { ExecutionError } from "./errors.js";
import {
  renderPreview,
  DEFAULT_PREVIEW_LIMITS,
  type PreviewLimits,
  type PreviewInput,
  type PreviewOutput
} from "./preview.js";

interface CacheEntry {
  principal: string;
  expiresAt: number;
  lines: string[];
}

export class PreviewCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly limits: PreviewLimits = DEFAULT_PREVIEW_LIMITS) {}

  private validateWindow(offset: number, limit: number): void {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 100 ||
      limit > 500 ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    ) {
      throw new ExecutionError("INVALID_ARGUMENT", "Invalid preview line window");
    }
  }

  async read(
    client: KGOSClient,
    principal: string,
    input: PreviewInput,
    signal?: AbortSignal
  ): Promise<PreviewOutput> {
    const limit = input.limit ?? 300;
    const offset = input.offset ?? 0;
    this.validateWindow(offset, limit);
    const now = Date.now();
    for (const [revision, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(revision);
    }
    const revision = input.viewRevision ?? randomUUID();
    let entry = this.entries.get(revision);
    if (input.viewRevision !== undefined && entry?.principal !== principal) {
      throw new ExecutionError("VIEW_EXPIRED", "Preview revision is expired or unavailable");
    }
    if (entry === undefined) {
      const lines = await renderPreview(client, {
        maxItems: this.limits.maxItems,
        ...(signal === undefined ? {} : { signal })
      });
      entry = { principal, expiresAt: now + this.limits.ttlMs, lines };
      while (this.entries.size >= this.limits.entries) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        this.entries.delete(oldest);
      }
      this.entries.set(revision, entry);
    }
    if (offset > entry.lines.length) {
      throw new ExecutionError("INVALID_ARGUMENT", "offset exceeds totalLines");
    }
    const page = entry.lines.slice(offset, offset + limit);
    return {
      totalLines: entry.lines.length,
      offset,
      lineCount: page.length,
      viewRevision: revision,
      preview: page.length === 0 ? "" : page.join("\n") + "\n"
    };
  }
}
