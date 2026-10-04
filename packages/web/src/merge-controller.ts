import {
  type KGOSClient,
  type JsonObject,
  type MergeConflict,
  type MergeFinalizeResult,
  type MergeSession,
  type MergeSessionSummary,
  type StateSummary
} from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { type Context } from "./context.js";
import { isObject } from "./json.js";
import { type Records } from "./records.js";
import { MergeDraft } from "./merge-draft.js";
import { VersionOperation } from "./version-operation.js";
import { eachSource, readSourced } from "./version-value-source.js";

export class MergeController extends VersionOperation {
  sessions: MergeSessionSummary[] = [];
  listCursor: string | undefined;
  session: MergeSession | undefined;
  conflicts: MergeConflict[] = [];
  readonly conflictSources = new WeakMap<MergeConflict, string>();
  cursor: string | undefined;
  draft: MergeDraft | undefined;
  result: MergeFinalizeResult | undefined;
  resultState: StateSummary | undefined;
  recovery: JsonObject | undefined;
  startAttempt: { branch: string; source: string } | undefined;
  sending = false;
  headMoved = false;
  notice = "";
  private checked = false;
  private observed = false;
  private resultChecked = false;

  constructor(
    connection: Connection,
    readonly context: Context,
    readonly records: Records | undefined
  ) {
    super(connection);
  }

  get actionable() {
    return (
      this.session !== undefined &&
      this.connection.client !== undefined &&
      !this.busy &&
      !this.sending &&
      !this.unknown &&
      !this.headMoved &&
      this.draft?.invalid !== true &&
      this.checked
    );
  }

  async list(more = false) {
    if (this.sending || this.busy) return false;
    const cursor = more && this.listCursor !== undefined ? { cursor: this.listCursor } : {};
    const page = await this.run((client, signal) =>
      client.evolution.merge.list({ limit: 20, ...cursor }, { signal })
    );
    if (page === undefined) return false;
    this.sessions = more ? [...this.sessions, ...page.items] : page.items;
    this.listCursor = page.cursor;
    this.changed();
    return true;
  }

  async restore() {
    if (this.busy || this.sending) return;
    const data = this.records?.slots.find((slot) => slot.kind === "workspace")?.data;
    const attempt = data?.["versionMergeStart"];
    if (
      isObject(attempt) &&
      attempt["pending"] === true &&
      typeof attempt["branch"] === "string" &&
      typeof attempt["source"] === "string"
    ) {
      this.startAttempt = { branch: attempt["branch"], source: attempt["source"] };
      this.unknown = true;
      this.notice = "start 结果待核对；原输入保留，先读取 Session 列表和 refs。";
    }
    await this.list();
    if (this.session !== undefined) return;
    const token = this.records?.slots.find((slot) => slot.kind === "workspace")?.data[
      "versionMergeSession"
    ];
    if (typeof token !== "string" || token === "") return;
    this.recovery = this.records?.slots.find(
      (slot) =>
        slot.kind === "draft" && slot.data["subtype"] === "merge" && slot.data["session"] === token
    )?.data;
    await this.open(token);
  }

  private adopt(session: MergeSession, fresh = false) {
    this.session = session;
    this.cursor = undefined;
    this.conflicts = [];
    this.checked = false;
    this.observed = true;
    if (fresh || this.draft?.session.session !== session.session) {
      this.draft = new MergeDraft(session, this.records, this.conflictSources);
      this.unknown = this.startAttempt !== undefined || this.draft.pending !== "";
    } else this.draft.invalidate();
    this.result = undefined;
    this.resultState = undefined;
    this.recovery = undefined;
    const workspace = this.records?.slots.find((slot) => slot.kind === "workspace");
    if (workspace !== undefined && workspace.data["versionMergeSession"] !== session.session)
      workspace.edit({ ...workspace.data, versionMergeSession: session.session });
    this.changed();
  }

  async start(branch: string, source: string) {
    if (this.busy || this.sending || this.unknown) return;
    this.startAttempt = { branch, source };
    this.resultChecked = false;
    this.sending = true;
    this.changed();
    try {
      const workspace = this.saveStart();
      if (workspace !== undefined && !(await workspace.flush())) {
        this.error = "start 输入尚未可靠保存，暂停发送";
        return;
      }
      const result = await this.run(
        (client, signal) => client.evolution.merge.start({ branch, source }, { signal }),
        true
      );
      if (result === undefined) {
        this.failedStart();
        return;
      }
      this.startAttempt = undefined;
      this.saveStart();
      this.headMoved = false;
      this.adopt(result, true);
      this.draft?.save();
    } finally {
      this.sending = false;
      this.changed();
    }
    await this.more();
    await this.context.observe();
  }

  private saveStart() {
    const workspace = this.records?.slots.find((slot) => slot.kind === "workspace");
    workspace?.edit({
      ...workspace.data,
      versionMergeStart:
        this.startAttempt === undefined ? null : { ...this.startAttempt, pending: true }
    });
    return workspace;
  }

  private failedStart() {
    if (!this.unknown) this.startAttempt = undefined;
    this.saveStart();
  }

  async open(token: string) {
    if (this.sending) return;
    const result = await this.run((client, signal) =>
      client.evolution.merge.get({ session: token }, { signal })
    );
    if (result === undefined) {
      this.checked = false;
      this.observed = false;
      this.changed();
      return;
    }
    this.adopt(result);
    await this.more();
  }

  async more() {
    const session = this.session;
    if (session === undefined || this.busy || this.sending) return;
    if (this.conflicts.length !== 0 && this.cursor === undefined) return;
    const cursor = this.cursor === undefined ? {} : { cursor: this.cursor };
    const response = await this.run((client, signal) =>
      readSourced(
        (options) =>
          client.evolution.merge.conflicts(
            { session: session.session, limit: 20, ...cursor },
            options
          ),
        signal
      )
    );
    if (response === undefined || this.session !== session) {
      if (this.errorCode === "CONSISTENCY_ERROR") this.checked = false;
      this.changed();
      return;
    }
    const page = response.value;
    if (page.session !== session.session || page.revision !== session.revision) {
      this.error = "Session revision 已变化；读取最新会话后比较原选择。";
      await this.open(session.session);
      return;
    }
    eachSource(response.source, page.items, (conflict, source) => {
      this.conflictSources.set(conflict, source);
    });
    this.conflicts.push(...page.items);
    this.cursor = page.cursor;
    this.checked = true;
    this.draft?.verify(this.conflicts, session.revision);
    this.changed();
  }

  choose(conflict: MergeConflict, choice: "ours" | "theirs" | "value", text: string) {
    if (!this.actionable || !this.conflicts.some((row) => row === conflict)) return;
    this.draft?.choose(conflict, choice, text, this.session?.revision ?? -1);
    this.changed();
  }

  compare() {
    if (this.session === undefined || !this.checked || this.sending) return;
    this.draft?.verify(this.conflicts, this.session.revision, true);
    this.notice = "已比较 conflict identity；选择仅属于当前 Session，不自动发送。";
    this.changed();
  }

  editMetadata(author: string, message: string) {
    if (this.sending || this.unknown || this.draft === undefined) return;
    this.draft.author = author;
    this.draft.message = message;
    this.draft.save();
    this.changed();
  }

  async resolve() {
    if (!this.actionable || this.session === undefined || this.draft === undefined) return;
    const session = this.session;
    let prepared;
    try {
      prepared = this.draft.encodeResolve(session);
    } catch (error) {
      this.error = this.connection.failure(error);
      this.changed();
      return;
    }
    const { request, encodedJSON } = prepared;
    const resolutions = request.resolutions;
    if (resolutions.length === 0) return;
    const result = await this.send("resolve", (client, signal) =>
      client.evolution.merge.resolve(request, { signal, encodedJSON })
    );
    if (result !== undefined) {
      for (const choice of resolutions) this.draft.choices.delete(choice.conflictId);
      this.adopt(result);
      this.notice = "解决方案已保存到 Session，尚未创建知识 State。";
      await this.receipt();
    }
    if (!this.unknown) await this.more();
  }

  async finalize(author: string, message: string) {
    const session = this.session;
    if (!this.actionable || session?.unresolved !== 0 || (this.draft?.choices.size ?? 0) > 0)
      return;
    const result = await this.send("finalize", (client, signal) =>
      client.evolution.merge.finalize(
        { session: session.session, expectedRevision: session.revision, author, message },
        { signal }
      )
    );
    if (result !== undefined) {
      this.result = result;
      this.notice = `合并完成：${this.result.status}`;
      this.checked = false;
      this.observed = false;
      await this.receipt();
    }
    if (this.result !== undefined) {
      const state = this.result.state;
      this.resultState = await this.run((client, signal) =>
        client.evolution.get({ state }, { signal })
      );
      await this.context.observe();
      this.changed();
    }
  }

  async abort() {
    const session = this.session;
    if (!this.abortable || session === undefined) return;
    const result = await this.send("abort", (client, signal) =>
      client.evolution.merge.abort(
        { session: session.session, expectedRevision: session.revision },
        { signal }
      )
    );
    if (result !== undefined) {
      this.checked = false;
      this.observed = false;
      this.notice = "已明确放弃 Session；没有创建 State。";
      await this.receipt();
    }
  }

  get abortable() {
    return (
      this.observed &&
      this.connection.client !== undefined &&
      !this.busy &&
      !this.sending &&
      !this.unknown
    );
  }

  suspend() {
    this.checked = false;
    this.observed = false;
    this.resultChecked = false;
    this.changed();
  }

  private async receipt() {
    if (this.draft?.slot !== undefined && this.draft.slot.adoption !== this.draft.adoption) {
      this.notice += "；Web 草稿已采用另一版本，请重新核对";
      return;
    }
    if (this.draft !== undefined && this.session !== undefined)
      this.draft.revision = this.session.revision;
    this.draft?.save("");
    if ((await this.draft?.slot?.flush()) !== true) this.notice += "；知识操作成功，Web 回执未保存";
    this.changed();
  }

  private async send<T>(
    action: string,
    mutation: (client: KGOSClient, signal: AbortSignal) => Promise<T>
  ): Promise<T | undefined> {
    const draft = this.draft;
    if (draft === undefined) return;
    this.sending = true;
    this.resultChecked = false;
    this.changed();
    try {
      draft.revision = this.session?.revision ?? draft.revision;
      const adoption = draft.slot?.adoption ?? 0;
      if (!(await draft.flush(action))) {
        this.error = "草稿尚未可靠保存，暂停发送";
        return;
      }
      if (draft.slot?.adoption !== adoption) {
        this.error = "草稿版本已采用，请重新核对";
        return;
      }
      const result = await this.run(mutation, true);
      if (result !== undefined && draft.slot.adoption === adoption) {
        this.unknown = false;
        draft.save("");
      } else if (!this.unknown && draft.slot.adoption === adoption) draft.save("");
      else this.notice = "结果待核对；先读取会话、refs 与 History，不重复发送。";
      this.headMoved = this.errorCode === "BRANCH_HEAD_MOVED" || this.headMoved;
      return result;
    } finally {
      this.sending = false;
      this.changed();
      if (this.errorCode === "MERGE_SESSION_CHANGED") {
        await this.check();
        this.notice = "MERGE_SESSION_CHANGED · 已读取最新会话；原选择保留，须重新比较后明确发送。";
        this.changed();
      }
    }
  }

  async check() {
    const token = this.session?.session ?? this.draft?.session.session;
    if (this.sending || this.busy) return;
    this.resultChecked = false;
    if (this.startAttempt !== undefined && this.unknown) {
      await this.checkStart();
      return;
    }
    if (token === undefined) return;
    await this.open(token);
    await this.context.observe();
    this.resultChecked =
      this.connection.client !== undefined && this.context.observationError === "";
    this.changed();
  }

  private async checkStart() {
    let complete = await this.list();
    while (complete && this.listCursor !== undefined && this.sessions.length < 4000)
      complete = await this.list(true);
    if (this.session !== undefined) await this.open(this.session.session);
    await this.context.observe();
    this.resultChecked =
      complete &&
      this.listCursor === undefined &&
      this.connection.client !== undefined &&
      this.context.observationError === "";
    this.notice = "已读取当前 Session 列表和 refs；请核对实际 token，明确继续不重发原 start。";
    this.changed();
  }

  get canAcknowledge() {
    return (
      this.resultChecked && this.connection.client !== undefined && !this.busy && !this.sending
    );
  }

  async adoptRecord() {
    if (this.sending || this.draft?.adopted() !== true) return;
    this.unknown = this.draft.pending !== "";
    this.checked = false;
    await this.check();
  }

  acknowledge() {
    if (!this.canAcknowledge) return;
    this.unknown = false;
    this.startAttempt = undefined;
    this.saveStart();
    this.draft?.save("");
    this.notice = "已明确核对结果；请重新比较选择，不自动重发。";
    this.changed();
  }
}
