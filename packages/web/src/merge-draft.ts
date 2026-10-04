import {
  type JsonObject,
  type MergeConflict,
  type MergeResolution,
  type MergeSession
} from "@kgos/sdk";

import { isObject, numberField, stableJSON, textField } from "./json.js";
import { type Records, type RecordSlot } from "./records.js";
import { jsonValue } from "./version-operation.js";
import { sourceIdentity } from "./version-value-source.js";

export interface MergeChoice {
  choice: "ours" | "theirs" | "value";
  text: string;
  identity: string;
  checked: boolean;
  revision: number;
}

function conflictIdentity(conflict: MergeConflict, source: string | undefined): string {
  if (source !== undefined) return sourceIdentity(source, "resolution");
  const identity = { ...conflict };
  delete identity.resolution;
  return stableJSON(jsonValue(JSON.stringify(identity)));
}

export class MergeDraft {
  slot: RecordSlot | undefined;
  readonly choices = new Map<string, MergeChoice>();
  revision: number;
  pending = "";
  invalid = false;
  adoption = 0;
  author = "";
  message = "";

  constructor(
    readonly session: MergeSession,
    readonly records: Records | undefined,
    readonly sources = new WeakMap<MergeConflict, string>()
  ) {
    this.revision = session.revision;
    this.slot = records?.slots.find(
      (slot) =>
        slot.kind === "draft" &&
        slot.data["subtype"] === "merge" &&
        slot.data["session"] === session.session
    );
    this.restore();
    this.adoption = this.slot?.adoption ?? 0;
  }

  private restore() {
    const data = this.slot?.data;
    if (data === undefined) return;
    this.revision = numberField(data, "revision", -1);
    this.pending = textField(data, "pending");
    this.author = textField(data, "author");
    this.message = textField(data, "message");
    this.invalid =
      data["targetState"] !== this.session.targetState ||
      data["sourceState"] !== this.session.sourceState ||
      data["session"] !== this.session.session ||
      data["branch"] !== this.session.branch;
    const choices = data["choices"];
    if (!Array.isArray(choices)) return;
    for (const input of choices) {
      if (!isObject(input)) continue;
      const choice = input["choice"];
      if (choice !== "ours" && choice !== "theirs" && choice !== "value") continue;
      this.choices.set(textField(input, "conflictId"), {
        choice,
        text: textField(input, "text"),
        identity: textField(input, "identity"),
        checked: false,
        revision: numberField(input, "revision", this.revision)
      });
    }
  }

  adopted() {
    if (this.slot === undefined || this.slot.adoption === this.adoption) return false;
    this.adoption = this.slot.adoption;
    this.choices.clear();
    this.restore();
    return true;
  }

  choose(conflict: MergeConflict, choice: MergeChoice["choice"], text: string, revision: number) {
    this.revision = revision;
    this.choices.set(conflict.conflictId, {
      choice,
      text,
      identity: conflictIdentity(conflict, this.sources.get(conflict)),
      checked: true,
      revision
    });
    this.save();
  }

  verify(conflicts: MergeConflict[], revision: number, explicit = false) {
    for (const [id, choice] of this.choices) {
      const actual = conflicts.find((conflict) => conflict.conflictId === id);
      choice.checked =
        !this.invalid &&
        (choice.revision === revision || explicit) &&
        actual !== undefined &&
        choice.identity === conflictIdentity(actual, this.sources.get(actual));
      if (explicit && choice.checked) choice.revision = revision;
    }
    if (explicit) this.revision = revision;
  }

  invalidate() {
    for (const choice of this.choices.values()) choice.checked = false;
  }

  resolutions(): MergeResolution[] {
    if (this.invalid || [...this.choices.values()].some((choice) => !choice.checked)) {
      throw new Error("请先核对当前 revision 和全部 conflictId；保留输入不自动应用");
    }
    return [...this.choices].map(([conflictId, input]) =>
      input.choice === "value"
        ? { conflictId, choice: input.choice, value: jsonValue(input.text) }
        : { conflictId, choice: input.choice }
    );
  }

  encodeResolve(session: MergeSession) {
    const resolutions = this.resolutions();
    const request = { session: session.session, expectedRevision: session.revision, resolutions };
    const encoded = resolutions.map((resolution) => {
      const metadata = JSON.stringify({
        conflictId: resolution.conflictId,
        choice: resolution.choice
      });
      return resolution.choice === "value"
        ? `${metadata.slice(0, -1)},"value":${this.choices.get(resolution.conflictId)?.text ?? "null"}}`
        : metadata;
    });
    const metadata = JSON.stringify({
      session: request.session,
      expectedRevision: request.expectedRevision
    });
    return {
      request,
      encodedJSON: `${metadata.slice(0, -1)},"resolutions":[${encoded.join(",")}]}`
    };
  }

  save(pending = this.pending) {
    this.pending = pending;
    const data: JsonObject = {
      version: 1,
      subtype: "merge",
      session: this.session.session,
      branch: this.session.branch,
      targetState: this.session.targetState,
      sourceState: this.session.sourceState,
      revision: this.revision,
      pending,
      author: this.author,
      message: this.message,
      choices: [...this.choices].map(([conflictId, input]) => ({
        conflictId,
        choice: input.choice,
        text: input.text,
        identity: input.identity,
        revision: input.revision
      }))
    };
    this.slot ??= this.records?.add("draft", data);
    this.slot?.edit(data);
  }

  async flush(pending: string): Promise<boolean> {
    this.save(pending);
    return this.slot !== undefined && (await this.slot.flush());
  }
}
