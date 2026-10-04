import { useState } from "react";
import { type MergeConflict } from "@kgos/sdk";

import { ValueView } from "./value-view.js";
import { type MergeController } from "./merge-controller.js";
import { sourceField } from "./version-value-source.js";

const conflictLabels = [
  ["base", "Base value"],
  ["ours", "Target · ours"],
  ["theirs", "Source · theirs"]
] as const;

function ConflictValue({
  conflict,
  side,
  label,
  source
}: {
  conflict: MergeConflict;
  side: "base" | "ours" | "theirs";
  label: string;
  source: string | undefined;
}) {
  const refKey = `${side}Ref` as const;
  return (
    <section className={`conflict-value ${side}`}>
      <h4>{label}</h4>
      <p>{conflict[refKey] ?? "未提供 Ref"}</p>
      {Object.hasOwn(conflict, side) ? (
        <ValueView value={conflict[side] ?? null} source={sourceField(source, side)} />
      ) : (
        <p>ABSENT · 该值未出现</p>
      )}
    </section>
  );
}

function MergeConflictEditor({
  model,
  conflict
}: {
  model: MergeController;
  conflict: MergeConflict;
}) {
  const input = model.draft?.choices.get(conflict.conflictId);
  const text = input?.text ?? "null";
  return (
    <section className="merge-conflict-editor">
      <h3>
        {conflict.kind} · {conflict.oursRef ?? conflict.theirsRef ?? conflict.baseRef ?? "公开冲突"}
      </h3>
      <p>
        <code>{conflict.path === "" ? "整个 Object" : conflict.path}</code> · opaque conflictId{" "}
        <code>{conflict.conflictId}</code>
      </p>
      {conflict.relatedRefs !== undefined && <p>相关聚合：{conflict.relatedRefs.join(" · ")}</p>}
      <div className="conflict-columns">
        {conflictLabels.map(([side, label]) => (
          <ConflictValue
            key={side}
            conflict={conflict}
            side={side}
            label={label}
            source={model.conflictSources.get(conflict)}
          />
        ))}
      </div>
      {conflict.resolution !== undefined && <p>Session 已保存选择：{conflict.resolution.choice}</p>}
      <fieldset disabled={!model.actionable}>
        <legend>未发送的解决输入</legend>
        <label>
          <input
            type="radio"
            name={`choice/${conflict.conflictId}`}
            checked={input?.choice === "ours"}
            onChange={() => {
              model.choose(conflict, "ours", text);
            }}
          />
          保留 Target · ours
        </label>
        <label>
          <input
            type="radio"
            name={`choice/${conflict.conflictId}`}
            checked={input?.choice === "theirs"}
            onChange={() => {
              model.choose(conflict, "theirs", text);
            }}
          />
          采用 Source · theirs
        </label>
        <label>
          <input
            type="radio"
            name={`choice/${conflict.conflictId}`}
            checked={input?.choice === "value"}
            onChange={() => {
              model.choose(conflict, "value", text);
            }}
          />
          明确 JSON value
        </label>
        <label>
          自定义 JSON 原文
          <textarea
            value={text}
            rows={5}
            spellCheck={false}
            onChange={(event) => {
              model.choose(conflict, "value", event.target.value);
            }}
          />
        </label>
      </fieldset>
      {input !== undefined && (
        <p>
          {input.checked
            ? "当前 revision / conflict identity 已核对"
            : "保留原输入；需与当前 Session 核对"}
        </p>
      )}
      <p>resolve 只保存 Session 方案；value 的公共 slot 合法性仍由 Kernel 验证。</p>
    </section>
  );
}

export function MergeConflicts({ model }: { model: MergeController }) {
  const [selected, setSelected] = useState("");
  const [page, setPage] = useState(0);
  const start = Math.min(page * 20, Math.max(0, model.conflicts.length - 1));
  const actual =
    model.conflicts.find((conflict) => conflict.conflictId === selected) ?? model.conflicts[0];
  return (
    <div className="merge-conflicts">
      <nav aria-label="公开 Merge conflicts">
        <h3>已加载冲突 {model.conflicts.length}</h3>
        {model.conflicts.slice(start, start + 20).map((conflict) => (
          <button
            key={conflict.conflictId}
            aria-pressed={conflict.conflictId === actual?.conflictId}
            onClick={() => {
              setSelected(conflict.conflictId);
            }}
          >
            {conflict.kind} · {conflict.path || "整个 Object"} · {conflict.conflictId}
            {conflict.resolution === undefined ? " · 未解决" : " · 已有方案"}
          </button>
        ))}
        <button
          disabled={page === 0}
          onClick={() => {
            setPage(page - 1);
          }}
        >
          上一冲突片段
        </button>
        <button
          disabled={start + 20 >= model.conflicts.length}
          onClick={() => {
            setPage(page + 1);
          }}
        >
          下一冲突片段
        </button>
        <button
          disabled={model.busy || model.sending || model.cursor === undefined}
          onClick={() => {
            void model.more();
          }}
        >
          加载更多冲突
        </button>
      </nav>
      {actual !== undefined ? (
        <MergeConflictEditor key={actual.conflictId} model={model} conflict={actual} />
      ) : (
        <p>
          当前页没有公开冲突；是否可完成仍以 Session status / unresolved 和 Kernel validation 为准。
        </p>
      )}
    </div>
  );
}
