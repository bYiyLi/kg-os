import { type EvolutionGetResult, type JsonObject, type JsonValue } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { jsonSourceField, stableSourceJSON, validSourceJSON } from "./json-source.js";
import { stableJSON, textField } from "./json.js";
import { type Records, type RecordSlot } from "./records.js";
import { readStateSource } from "./version-json-source.js";
import { jsonValue, VersionOperation } from "./version-operation.js";

export class StateDetail extends VersionOperation {
  value: EvolutionGetResult | undefined;
  dataSource: string | undefined;

  async open(state: string) {
    this.value = undefined;
    this.dataSource = undefined;
    const result = await this.run((client, signal) => readStateSource(client, state, signal));
    if (result !== undefined) {
      this.value = result.value;
      this.dataSource = result.dataSource;
    }
    this.changed();
  }
}

export class StateDataDraft extends VersionOperation {
  text = "null";
  intent: "set" | "clear" = "set";
  observed: { hasData: boolean; data: JsonValue };
  live: { hasData: boolean; data: JsonValue };
  observedSource: string | undefined;
  liveSource: string | undefined;
  slot: RecordSlot | undefined;
  needsComparison = false;
  savedReceipt = true;
  notice = "";
  sending = false;
  checked = true;
  private adoption = 0;
  bindingInvalid = false;

  constructor(
    connection: Connection,
    readonly state: string,
    initial: EvolutionGetResult & { dataSource?: string },
    readonly records: Records | undefined
  ) {
    super(connection);
    this.observed = { hasData: initial.hasData, data: initial.data };
    this.live = this.observed;
    this.liveSource = validSourceJSON(initial.dataSource);
    this.observedSource = this.liveSource;
    this.text = this.liveSource ?? "null";
    this.checked = !initial.hasData || this.liveSource !== undefined;
    this.needsComparison = !this.checked;
    this.restore();
    this.adoption = this.slot?.adoption ?? 0;
  }

  private restore() {
    this.slot = this.records?.slots.find(
      (slot) =>
        slot.kind === "draft" &&
        slot.data["subtype"] === "state-data" &&
        slot.data["state"] === this.state
    );
    if (this.slot === undefined) return;
    const data = this.slot.data;
    this.text = textField(data, "text", "null");
    this.intent = data["intent"] === "clear" ? "clear" : "set";
    this.observed = { hasData: data["hasData"] === true, data: data["data"] ?? null };
    this.observedSource = validSourceJSON(data["observedSource"]);
    this.needsComparison = true;
    this.unknown = data["pending"] === true;
  }

  private data(pending = this.unknown): JsonObject {
    return {
      version: 1,
      subtype: "state-data",
      state: this.state,
      intent: this.intent,
      text: this.text,
      hasData: this.observed.hasData,
      data: this.observed.data,
      ...(this.observedSource === undefined ? {} : { observedSource: this.observedSource }),
      pending
    };
  }

  async adoptRecord() {
    const slot =
      this.slot ??
      this.records?.slots.find(
        (item) =>
          item.kind === "draft" &&
          item.data["subtype"] === "state-data" &&
          item.data["state"] === this.state
      );
    if (
      slot === undefined ||
      (slot === this.slot && slot.adoption === this.adoption) ||
      this.sending
    )
      return;
    this.adoption = slot.adoption;
    if (slot.data["state"] !== this.state || slot.data["subtype"] !== "state-data") {
      this.text = textField(slot.data, "text");
      this.bindingInvalid = true;
      this.needsComparison = true;
      this.error = "采用的草稿属于另一 State，保留原文，请打开其对应 State";
      this.changed();
      return;
    }
    this.restore();
    this.bindingInvalid = false;
    this.checked = false;
    await this.check();
  }

  edit(text: string, intent: "set" | "clear" = "set") {
    if (this.busy || this.sending || this.unknown || this.bindingInvalid) return;
    this.text = text;
    this.intent = intent;
    this.notice = "";
    this.save();
    this.changed();
  }

  private save(pending = this.unknown) {
    const data = this.data(pending);
    this.slot ??= this.records?.add("draft", data);
    this.slot?.edit(data);
  }

  get changedSidecar() {
    if (this.observed.hasData !== this.live.hasData) return true;
    if (!this.live.hasData) return false;
    return (
      this.observedSource === undefined ||
      this.liveSource === undefined ||
      stableSourceJSON(this.observedSource) !== stableSourceJSON(this.liveSource)
    );
  }

  get precisionKnown() {
    return (
      (!this.observed.hasData || this.observedSource !== undefined) &&
      (!this.live.hasData || this.liveSource !== undefined)
    );
  }

  async check() {
    if (this.sending) return;
    this.checked = false;
    const result = await this.run((client, signal) => readStateSource(client, this.state, signal));
    if (result === undefined) return;
    this.live = { hasData: result.value.hasData, data: result.value.data };
    this.liveSource = result.dataSource;
    this.checked = !this.live.hasData || this.liveSource !== undefined;
    this.needsComparison = true;
    this.notice = "已读取当前注释；请比较后明确继续。State Data 没有并发覆盖保护。";
    this.changed();
  }

  acknowledge() {
    if (!this.checked || this.sending || this.bindingInvalid) return;
    this.observed = this.live;
    this.observedSource = this.liveSource;
    this.needsComparison = false;
    this.unknown = false;
    this.notice = "已确认比较，提交仍为明确 set / clear，不保证避免其他调用方覆盖。";
    this.save(false);
    this.changed();
  }

  async submit() {
    if (this.busy || this.sending || this.unknown || this.needsComparison || this.bindingInvalid)
      return;
    let value: JsonValue = null;
    try {
      if (this.intent === "set") value = jsonValue(this.text);
    } catch {
      this.error = "请输入合法 JSON；原输入已保留";
      this.changed();
      return;
    }
    const intent = this.intent;
    const text = this.text;
    this.sending = true;
    this.changed();
    try {
      await this.send(intent, value, text);
    } finally {
      this.sending = false;
      this.changed();
    }
  }

  private async send(intent: "set" | "clear", value: JsonValue, text: string) {
    this.save(true);
    const adoption = this.slot?.adoption;
    if (this.slot === undefined || !(await this.slot.flush())) {
      this.error = "草稿尚未可靠保存，暂停发送";
      this.changed();
      return;
    }
    if (adoption !== this.slot.adoption) {
      this.error = "已采用另一版本，请重新核对注释草稿";
      return;
    }
    const snapshot = stableJSON(this.slot.data);
    const result = await this.run(async (client, signal) => {
      if (intent === "clear") {
        await client.evolution.state.clearData({ state: this.state }, { signal });
        return { hasData: false, data: null, dataSource: "null" };
      }
      let dataSource: string | undefined;
      const response = await client.evolution.state.setData(
        { state: this.state, data: value },
        {
          signal,
          encodedJSON: `{"state":${JSON.stringify(this.state)},"data":${text}}`,
          onJSONResponse: (source) => {
            dataSource = jsonSourceField(source, "data");
          }
        }
      );
      return { hasData: true, data: response.data, dataSource };
    }, true);
    if (result === undefined) {
      this.checked = !this.unknown;
      if (adoption !== this.slot.adoption || snapshot !== stableJSON(this.slot.data)) {
        this.notice = "本次设置失败或结果待核对；已保留后来采用的版本或新输入，不用旧回执覆盖。";
        this.changed();
        return;
      }
      this.save(this.unknown);
      this.notice = this.unknown
        ? "结果待核对；先读取当前注释，不自动重发。"
        : "设置失败，输入已保留。";
    } else {
      this.live = { hasData: result.hasData, data: result.data };
      this.liveSource = result.dataSource;
      this.observed = this.live;
      this.observedSource = this.liveSource;
      this.checked = this.liveSource !== undefined;
      this.needsComparison = !this.checked;
      this.notice = "注释已更新，State identity 保持原值。";
      if (adoption !== this.slot.adoption || snapshot !== stableJSON(this.slot.data)) {
        this.notice += "；Web 草稿已采用另一版本或保留新输入，请重读比较";
        this.changed();
        return;
      }
      this.save(false);
      this.savedReceipt = await this.slot.flush();
      if (!this.savedReceipt) this.notice = "注释已更新，Web 回执未保存。";
    }
    this.changed();
  }
}
