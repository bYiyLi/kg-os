import { KGOSDaemonError, type JsonObject, type ObjectKind, type PatchResult } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { type Context } from "./context.js";
import { draftData, readDraft, type ObjectDraftData } from "./edit-data.js";
import { inputIssues } from "./edit-input.js";
import { blankBody, newRef, objectPatch, type DraftEntry } from "./edit-patch.js";
import { readReconciliation } from "./edit-reconcile.js";
import { impactNotes, validateDraft, type InputIssue } from "./edit-validation.js";
import {
  type YAMLPath,
  setYamlRaw,
  setYamlValue,
  appendYaml,
  removeYaml,
  renameYamlKey
} from "./edit-yaml.js";
import { Observable } from "./observable.js";
import { type Records, type RecordSlot } from "./records.js";

export interface DraftPreview {
  patch: string;
  entries: DraftEntry[];
  notes: string[];
  issues: InputIssue[];
}

export class ObjectDraft extends Observable {
  readonly data: ObjectDraftData;
  slot: RecordSlot | undefined;
  loading = false;
  busy = false;
  verified = false;
  head: string | undefined;
  error = "";
  backendDetails: JsonObject | undefined;
  review: DraftPreview | undefined;
  evidence: JsonObject | undefined;
  receiptSaved = false;
  private readonly unsubscribe: (() => void)[] = [];
  private verification: AbortController | undefined;
  private reading: AbortController | undefined;
  private adoptionPending = false;
  private verificationPending = false;
  private sourceGeneration = 0;
  private disposed = false;

  constructor(
    readonly connection: Connection,
    readonly context: Context,
    readonly records: Records | undefined,
    slot?: RecordSlot
  ) {
    super();
    this.slot = slot;
    this.data =
      slot === undefined
        ? {
            baseState: context.state,
            branch: context.targetBranch,
            entries: [],
            inputs: {},
            status: "editing",
            patch: "",
            receipt: undefined
          }
        : readDraft(slot.data);
    this.receiptSaved = this.data.status === "committed" && this.data.receipt !== undefined;
    this.unsubscribe.push(
      context.subscribe(() => {
        this.changed();
      }),
      connection.subscribe(() => {
        this.verified = false;
        this.changed();
      })
    );
    if (slot !== undefined) this.watchSlot(slot);
  }

  get editable() {
    return !this.busy && !this.loading && this.data.status === "editing";
  }
  get canSubmit() {
    return (
      this.editable &&
      this.verified &&
      this.connection.writableStore &&
      this.slot !== undefined &&
      this.slot.status !== "内容冲突" &&
      this.slot.status !== "结果待核对" &&
      this.slot.status !== "已删除" &&
      this.context.editable &&
      this.context.state === this.data.baseState &&
      this.context.targetBranch === this.data.branch &&
      this.context.inputRef === `branch/${this.data.branch}`
    );
  }

  private watchSlot(slot: RecordSlot) {
    let adoption = slot.adoption;
    this.unsubscribe.push(
      slot.subscribe(() => {
        if (this.slot === slot && slot.adoption !== adoption) {
          adoption = slot.adoption;
          if (this.busy) this.adoptionPending = true;
          else this.adopt(slot);
        }
        this.changed();
      })
    );
  }

  private adopt(slot: RecordSlot) {
    this.sourceGeneration += 1;
    this.verification?.abort();
    this.reading?.abort();
    try {
      Object.assign(this.data, readDraft(slot.data));
      this.review = undefined;
      this.backendDetails = undefined;
      this.evidence = undefined;
      this.error = "";
      this.verified = false;
      this.receiptSaved = this.data.status === "committed" && this.data.receipt !== undefined;
      if (this.loading) this.verificationPending = true;
      else void this.verify();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "已采用记录无法读取";
      this.data.status = "unknown";
    }
  }

  dispose() {
    this.disposed = true;
    this.sourceGeneration += 1;
    this.verification?.abort();
    this.reading?.abort();
    for (const unsubscribe of this.unsubscribe) unsubscribe();
  }

  private persist() {
    const data = draftData(this.data);
    if ((this.slot === undefined || this.adoptionPending) && this.records !== undefined) {
      this.slot = this.records.add("draft", data);
      this.watchSlot(this.slot);
      this.adoptionPending = false;
    }
    this.slot?.edit(data);
    this.changed();
  }

  async start(ref: string | undefined, kind: ObjectKind = "knowledge-node"): Promise<void> {
    if (this.slot !== undefined) {
      await this.verify();
      return;
    }
    if (!this.context.editable) {
      this.error = "当前阅读是只读；请选择 Branch 并读取其 head 后显式编辑";
      this.changed();
      return;
    }
    if (ref === undefined) this.addNew(kind);
    else await this.addExisting(ref);
    if (this.data.entries.length > 0) await this.verify();
  }

  addNew(kind: ObjectKind, alias: string = crypto.randomUUID()): void {
    if (!this.editable || this.data.entries.length >= 100) return;
    const ref = newRef(kind, alias);
    if (this.data.entries.some((entry) => entry.ref === ref))
      throw new Error("本次草稿已声明该 kind / alias；请使用不同 alias");
    this.data.entries.push({ ref, kind, base: "", body: blankBody(kind), deleted: false });
    this.review = undefined;
    this.persist();
  }

  async addExisting(ref: string): Promise<boolean> {
    const client = this.connection.client;
    if (client === undefined || !this.editable) return false;
    if (this.data.entries.some((entry) => entry.ref === ref) || this.data.entries.length >= 100) {
      this.error = "target 已在草稿内，或已达 100 个 target 上限";
      this.changed();
      return false;
    }
    const controller = this.connection.controller();
    const generation = this.sourceGeneration;
    this.reading = controller;
    this.loading = true;
    this.changed();
    try {
      const request = { at: this.data.baseState, refs: [ref] };
      const [structured, text] = await Promise.all([
        client.object.read(request, { signal: controller.signal }),
        client.object.readText(request, { signal: controller.signal })
      ]);
      const body = text.results[0];
      const value = structured.results[0];
      if (
        structured.state !== this.data.baseState ||
        text.state !== this.data.baseState ||
        body === undefined ||
        value === undefined ||
        body.ref !== ref ||
        value.ref !== ref ||
        body.kind !== value.kind ||
        text.results.length !== 1 ||
        structured.results.length !== 1
      )
        throw new Error("Object 读取未返回同一完整 State / aggregate");
      if (
        controller.signal.aborted ||
        this.connection.client !== client ||
        generation !== this.sourceGeneration
      )
        return false;
      this.data.entries.push({
        ref,
        kind: body.kind,
        base: body.body,
        body: body.body,
        deleted: false
      });
      this.review = undefined;
      this.error = "";
      this.persist();
      return true;
    } catch (error) {
      this.error = this.connection.failure(error);
      return false;
    } finally {
      this.connection.release(controller);
      this.reading = undefined;
      this.finishRead();
    }
  }

  update(ref: string, body: string, preserveInputs = false) {
    if (!this.editable) return;
    const entry = this.data.entries.find((entry) => entry.ref === ref);
    if (entry === undefined) return;
    entry.body = body;
    if (!preserveInputs) this.clearInputs(ref);
    this.review = undefined;
    this.error = "";
    this.backendDetails = undefined;
    this.persist();
  }

  mutate(ref: string, operation: (body: string) => string) {
    const entry = this.data.entries.find((entry) => entry.ref === ref);
    if (entry === undefined || !this.editable) return;
    try {
      this.update(ref, operation(entry.body), true);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "字段无法无损编辑";
      this.changed();
    }
  }

  set(ref: string, path: YAMLPath, value: string | boolean | null | string[]) {
    this.mutate(ref, (body) => setYamlValue(body, path, value));
  }
  setRaw(ref: string, path: YAMLPath, raw: string) {
    this.mutate(ref, (body) => setYamlRaw(body, path, raw));
  }
  remove(ref: string, path: YAMLPath) {
    if (!this.editable) return;
    this.data.inputs = Object.fromEntries(
      Object.entries(this.data.inputs).filter(([key]) => key !== this.inputKey(ref, path))
    );
    this.mutate(ref, (body) => removeYaml(body, path));
  }
  append(ref: string, path: YAMLPath, raw: string) {
    this.mutate(ref, (body) => appendYaml(body, path, raw));
  }

  private inputKey(ref: string, path: YAMLPath) {
    return `${ref}|/${path.map((part) => String(part).replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
  }

  input(ref: string, path: YAMLPath): string | undefined {
    return this.data.inputs[this.inputKey(ref, path)];
  }

  setInput(ref: string, path: YAMLPath, raw: string) {
    if (!this.editable) return;
    this.data.inputs[this.inputKey(ref, path)] = raw;
    this.review = undefined;
    this.persist();
    this.setRaw(ref, path, raw);
  }

  renameKey(ref: string, path: YAMLPath, name: string) {
    if (!this.editable) return;
    const input = this.input(ref, path);
    this.mutate(ref, (body) => renameYamlKey(body, path, name));
    if (this.error !== "") return;
    this.data.inputs = Object.fromEntries(
      Object.entries(this.data.inputs).filter(([key]) => key !== this.inputKey(ref, path))
    );
    if (input !== undefined)
      this.data.inputs[this.inputKey(ref, [...path.slice(0, -1), name])] = input;
    this.persist();
  }

  private clearInputs(ref: string) {
    this.data.inputs = Object.fromEntries(
      Object.entries(this.data.inputs).filter(([key]) => !key.startsWith(`${ref}|`))
    );
  }

  markDelete(ref: string) {
    if (!this.editable) return;
    const entry = this.data.entries.find((entry) => entry.ref === ref);
    if (entry === undefined) return;
    if (entry.base === "") this.data.entries.splice(this.data.entries.indexOf(entry), 1);
    else entry.deleted = !entry.deleted;
    this.clearInputs(ref);
    this.review = undefined;
    this.persist();
  }

  preview(): DraftPreview {
    const entries = this.data.entries.map((entry) => ({ ...entry }));
    const issues = [...validateDraft(entries), ...inputIssues(this.data.inputs)];
    this.review = { entries, issues, patch: "", notes: [] };
    if (issues.length === 0) {
      this.review.patch = objectPatch(entries);
      this.review.notes = entries.flatMap(impactNotes);
    }
    this.changed();
    return this.review;
  }

  async verify(): Promise<boolean> {
    const client = this.connection.client;
    if (client === undefined || this.loading || this.busy || this.disposed) return false;
    this.verification?.abort();
    const controller = this.connection.controller();
    const generation = this.sourceGeneration;
    this.verification = controller;
    this.verified = false;
    this.loading = true;
    this.changed();
    try {
      const refs = this.data.entries.filter((entry) => entry.base !== "").map((entry) => entry.ref);
      const [state, branches, text] = await Promise.all([
        client.evolution.get({ state: this.data.baseState }, { signal: controller.signal }),
        client.evolution.branch.list({ signal: controller.signal }),
        refs.length === 0
          ? undefined
          : client.object.readText({ at: this.data.baseState, refs }, { signal: controller.signal })
      ]);
      if (
        controller.signal.aborted ||
        this.connection.client !== client ||
        generation !== this.sourceGeneration
      )
        return false;
      this.head = branches.items.find((branch) => branch.name === this.data.branch)?.state;
      if (state.state !== this.data.baseState) throw new Error("原 baseState 不可核对；保留草稿");
      this.checkBytes(text);
      if (this.head === undefined) throw new Error("目标 Branch 不存在；保留草稿，禁止提交");
      if (this.head !== this.data.baseState)
        throw new Error(`STALE_BASE_STATE：原 base ${this.data.baseState}；当前 head ${this.head}`);
      this.verified = true;
      this.error = "";
      return true;
    } catch (error) {
      this.error = this.connection.failure(error);
      return false;
    } finally {
      this.connection.release(controller);
      this.finishRead();
    }
  }

  private finishRead() {
    this.loading = false;
    this.changed();
    if (this.verificationPending && !this.disposed) {
      this.verificationPending = false;
      void this.verify();
    }
  }

  private checkBytes(
    text: { state: string; results: { ref: string; kind: ObjectKind; body: string }[] } | undefined
  ) {
    const existing = this.data.entries.filter((entry) => entry.base !== "");
    if (text === undefined && existing.length === 0) return;
    if (
      text?.state !== this.data.baseState ||
      text.results.length !== existing.length ||
      existing.some((entry) => {
        const body = text.results.find((item) => item.ref === entry.ref);
        return body?.kind !== entry.kind || body.body !== entry.base;
      })
    )
      throw new Error(
        "原 base canonical bytes 不一致；保留输入，禁止直接提交，请对照新基底手动重建"
      );
  }

  async submit(): Promise<PatchResult | undefined> {
    const review = this.review;
    if (!this.canSubmit || review?.issues.length !== 0) return undefined;
    if (!(await this.verify()) || this.review !== review || !this.stillEligible()) return undefined;
    const client = this.connection.client;
    const slot = this.slot;
    if (client === undefined || slot === undefined) return undefined;
    const frozen = review.patch;
    this.busy = true;
    this.data.status = "pending";
    this.data.patch = frozen;
    this.error = "";
    this.persist();
    if (!(await slot.flush()) || this.connection.client !== client) {
      this.data.status = "editing";
      this.busy = false;
      this.error = "已确认草稿与待核对标记未可靠保存；保留输入，本次未发送 Patch";
      this.persist();
      return undefined;
    }
    return this.sendFrozen(client, frozen);
  }

  private stillEligible() {
    return this.canSubmit;
  }

  private async sendFrozen(
    client: NonNullable<Connection["client"]>,
    patch: string
  ): Promise<PatchResult | undefined> {
    const controller = this.connection.controller();
    try {
      const receipt = await client.object.patch(
        { baseState: this.data.baseState, branch: this.data.branch, patch },
        { signal: controller.signal }
      );
      this.data.receipt = receipt;
      this.data.status = "committed";
      this.changed();
      this.persist();
      this.receiptSaved = (await this.slot?.flush()) === true;
      if (!this.receiptSaved)
        this.error = "知识已提交，Web 回执未保存；可重试保存回执，不重新发送 Patch";
      return receipt;
    } catch (error) {
      this.data.status = error instanceof KGOSDaemonError ? "editing" : "unknown";
      this.error = this.connection.failure(error);
      if (error instanceof KGOSDaemonError) this.backendDetails = error.details;
      else
        this.error = `写入结果未知：${this.error}。先核对 Branch、对象与历史，不自动重发，也不猜 alias mapping。`;
      this.verified = false;
      this.persist();
      await this.slot?.flush();
      return undefined;
    } finally {
      this.connection.release(controller);
      this.busy = false;
      this.changed();
    }
  }

  async save(): Promise<boolean> {
    return (await this.slot?.flush()) === true;
  }

  async discard(): Promise<boolean> {
    if (!this.editable) return false;
    if (this.slot === undefined) return true;
    if (!(await this.save()) || !(await this.slot.delete())) {
      this.error = "草稿删除未获得确认；保留输入，请核对 Web 保存状态";
      this.changed();
      return false;
    }
    return true;
  }

  async saveReceipt(): Promise<boolean> {
    if (this.data.receipt === undefined || this.busy) return false;
    this.persist();
    this.receiptSaved = await this.save();
    this.error = this.receiptSaved ? "" : "知识已提交，Web 回执未保存";
    this.changed();
    return this.receiptSaved;
  }

  async reconcile(): Promise<void> {
    const client = this.connection.client;
    if (client === undefined || this.busy || this.data.status !== "unknown") return;
    const controller = this.connection.controller();
    const generation = this.sourceGeneration;
    this.reading = controller;
    this.loading = true;
    this.changed();
    try {
      const evidence = await readReconciliation(client, this.connection, controller.signal, {
        baseState: this.data.baseState,
        branch: this.data.branch,
        refs: this.data.entries.filter((entry) => entry.base !== "").map((entry) => entry.ref)
      });
      if (
        controller.signal.aborted ||
        generation !== this.sourceGeneration ||
        this.connection.client !== client
      )
        return;
      this.evidence = evidence;
      this.error =
        "已读取核对资料；结果仍待人工核对，alias 未获得回执时不能推断正式 Ref。本草稿不会重新发送。";
    } catch (error) {
      if (generation === this.sourceGeneration && !controller.signal.aborted)
        this.error = this.connection.failure(error);
    } finally {
      this.connection.release(controller);
      this.reading = undefined;
      this.finishRead();
    }
  }
}
