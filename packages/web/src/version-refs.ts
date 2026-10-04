import { type StateCreateRequest } from "@kgos/sdk";

import { type Context } from "./context.js";
import { jsonValue, VersionOperation } from "./version-operation.js";

export interface RefAction {
  kind: "branch" | "tag";
  action: "create" | "move" | "delete";
  name: string;
  target: string;
}

export class VersionRefs extends VersionOperation {
  notice = "";
  createdState = "";
  pending: RefAction | StateCreateRequest | undefined;
  private checked = false;

  constructor(readonly context: Context) {
    super(context.connection);
  }

  async apply(input: RefAction) {
    if (this.busy || this.unknown) return;
    if (input.kind === "branch" && input.action === "move") {
      this.error = "Branch 仅支持创建和删除";
      this.changed();
      return;
    }
    const request = structuredClone(input);
    this.checked = false;
    this.pending = request;
    const result = await this.run((client, signal) => {
      const options = { signal };
      if (request.kind === "branch")
        return request.action === "delete"
          ? client.evolution.branch.delete({ name: request.name }, options)
          : client.evolution.branch.create({ name: request.name, from: request.target }, options);
      if (request.action === "delete")
        return client.evolution.tag.delete({ name: request.name }, options);
      return request.action === "move"
        ? client.evolution.tag.move({ name: request.name, target: request.target }, options)
        : client.evolution.tag.create({ name: request.name, target: request.target }, options);
    }, true);
    if (result !== undefined) {
      this.pending = undefined;
      this.notice = `${request.kind}/${result.name} · ${request.action} 已完成`;
      await this.context.observe();
    }
    this.changed();
  }

  async create(request: StateCreateRequest, dataText?: string) {
    if (this.busy || this.unknown) return;
    const frozen = structuredClone(request);
    let encodedJSON: string | undefined;
    try {
      if (dataText !== undefined) {
        frozen.data = jsonValue(dataText);
        const metadata = { ...frozen };
        delete metadata.data;
        encodedJSON = `${JSON.stringify(metadata).slice(0, -1)},"data":${dataText}}`;
      }
    } catch {
      this.error = "初始 State Data 必须是合法 JSON；输入已保留";
      this.changed();
      return;
    }
    this.checked = false;
    this.pending = frozen;
    const result = await this.run(
      (client, signal) =>
        client.evolution.state.create(frozen, {
          signal,
          ...(encodedJSON === undefined ? {} : { encodedJSON })
        }),
      true
    );
    if (result !== undefined) {
      this.pending = undefined;
      this.createdState = result.state;
      this.notice = "新 State 已创建；当前浏览版本保持固定。";
      await this.context.observe();
    }
    this.changed();
  }

  async check() {
    await this.context.observe();
    this.checked = this.connection.client !== undefined && this.context.observationError === "";
    this.notice = this.checked
      ? "已重新观察 refs。请对照原请求、实际 head 和 History 核对结果。"
      : "refs 核对未成功，保留原请求并重新连接后再检查。";
    this.changed();
  }

  acknowledge() {
    if (!this.checked) return;
    this.unknown = false;
    this.pending = undefined;
    this.notice = "已明确核对结果；没有自动重发原请求。";
    this.changed();
  }
}
