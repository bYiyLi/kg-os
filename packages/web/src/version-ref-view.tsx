import { useState, useSyncExternalStore } from "react";

import { type Context } from "./context.js";
import { type RefAction, type VersionRefs } from "./version-refs.js";
import { jsonValue } from "./version-operation.js";

function RefForm({ model, context }: { model: VersionRefs; context: Context }) {
  const [kind, setKind] = useState<RefAction["kind"]>("branch");
  const [action, setAction] = useState<RefAction["action"]>("create");
  const [name, setName] = useState("");
  const [target, setTarget] = useState(context.state);
  const actionLabels = { create: "创建", move: "移动 Tag", delete: "删除 ref" };
  const previous = (kind === "branch" ? context.branches : context.tags).find(
    (item) => item.name === name
  )?.state;
  return (
    <section className="ref-form">
      <h3>显式 ref 操作</h3>
      <label>
        类别
        <select
          disabled={model.busy}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as RefAction["kind"]);
            setAction("create");
          }}
        >
          <option value="branch">Branch</option>
          <option value="tag">Tag</option>
        </select>
      </label>
      <label>
        动作
        <select
          disabled={model.busy}
          value={action}
          onChange={(event) => {
            setAction(event.target.value as RefAction["action"]);
          }}
        >
          <option value="create">创建</option>
          {kind === "tag" && <option value="move">移动</option>}
          <option value="delete">删除 ref</option>
        </select>
      </label>
      <label>
        名称
        <input
          disabled={model.busy}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      {action !== "delete" && (
        <label>
          {kind === "branch" ? "明确 from StateRef" : "明确 target StateRef"}
          <input
            disabled={model.busy}
            value={target}
            onChange={(event) => {
              setTarget(event.target.value);
            }}
          />
        </label>
      )}
      {action === "move" && (
        <p>
          已观察旧目标 <code>{previous ?? "未找到"}</code> → 新目标 <code>{target}</code>
        </p>
      )}
      {action === "delete" && (
        <p>
          删除 {kind}/{name} 引用；历史 State 保持存在。默认分支删除由后端裁决。
        </p>
      )}
      <button
        disabled={
          model.busy || model.unknown || name === "" || (action !== "delete" && target === "")
        }
        onClick={() => {
          void model.apply({ kind, action, name, target });
        }}
      >
        确认{actionLabels[action]}
      </button>
    </section>
  );
}

function StateCreateForm({ model, context }: { model: VersionRefs; context: Context }) {
  const [branch, setBranch] = useState(context.targetBranch);
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const [includeData, setIncludeData] = useState(false);
  const [data, setData] = useState("null");
  const [error, setError] = useState("");
  const head = context.branches.find((ref) => ref.name === branch)?.state;
  const create = () => {
    try {
      const initialData = includeData ? { data: jsonValue(data) } : {};
      setError("");
      void model.create(
        { branch, author, message, ...initialData },
        includeData ? data : undefined
      );
    } catch {
      setError("初始 State Data 必须是合法 JSON；输入已保留");
    }
  };
  return (
    <section className="state-create">
      <h3>显式创建 State</h3>
      <label>
        目标 Branch
        <select
          value={branch}
          disabled={model.busy}
          onChange={(event) => {
            setBranch(event.target.value);
          }}
        >
          {context.branches.map((ref) => (
            <option key={ref.name} value={ref.name}>
              {ref.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        观察到的 parent <code>{head ?? "目标 Branch 不存在"}</code>；提交时使用实际
        head，此观察不构成 CAS。
      </p>
      <label>
        Author
        <input
          value={author}
          disabled={model.busy}
          onChange={(event) => {
            setAuthor(event.target.value);
          }}
        />
      </label>
      <label>
        提交说明
        <input
          value={message}
          disabled={model.busy}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
      </label>
      <InitialStateData
        includeData={includeData}
        setIncludeData={setIncludeData}
        data={data}
        setData={setData}
        busy={model.busy}
      />
      <p>即使 Snapshot delta 为空，也创建真实新 State。这里只设置通用 JSON 注释。</p>
      <button disabled={model.busy || model.unknown || head === undefined} onClick={create}>
        确认创建 State
      </button>
      {error !== "" && <p role="alert">{error}</p>}
    </section>
  );
}

export function RefsWorkspace({ model, context }: { model: VersionRefs; context: Context }) {
  useSyncExternalStore(model.subscribe, model.snapshot);
  useSyncExternalStore(context.subscribe, context.snapshot);
  return (
    <div className="refs-workspace">
      <button
        disabled={model.busy}
        onClick={() => {
          void context.observe();
        }}
      >
        读取 Branch / Tag 列表
      </button>
      <p>ref 标签来自可变指针；读取不会切换当前浏览 commit。</p>
      <div className="ref-lists">
        {(["branch", "tag"] as const).map((kind) => (
          <section key={kind}>
            <h3>{kind === "branch" ? "Branch" : "Tag"}</h3>
            {(kind === "branch" ? context.branches : context.tags).map((ref) => (
              <article key={ref.name}>
                <button
                  onClick={() => {
                    void context.select(`${kind}/${ref.name}`, ref.state);
                  }}
                >
                  {ref.name}
                </button>
                <code>{ref.state}</code>
                <button
                  disabled={model.busy || model.unknown}
                  onClick={() => {
                    void model.apply({ kind, action: "delete", name: ref.name, target: ref.state });
                  }}
                >
                  删除 ref {ref.name}
                </button>
              </article>
            ))}
          </section>
        ))}
      </div>
      <RefForm model={model} context={context} />
      <StateCreateForm model={model} context={context} />
      {model.createdState !== "" && (
        <button
          onClick={() => {
            void context.select(model.createdState);
          }}
        >
          查看新 State {model.createdState}
        </button>
      )}
      {model.error !== "" && <p role="alert">{model.error}</p>}
      {model.notice !== "" && <p role="status">{model.notice}</p>}
      {model.unknown && (
        <>
          <p role="status">结果未知，原请求已保留。请读取 refs / History 核对。</p>
          <button
            onClick={() => {
              void model.check();
            }}
          >
            重新观察 refs
          </button>
          <button
            onClick={() => {
              model.acknowledge();
            }}
          >
            已核对结果，继续操作
          </button>
        </>
      )}
    </div>
  );
}

function InitialStateData({
  includeData,
  setIncludeData,
  data,
  setData,
  busy
}: {
  includeData: boolean;
  setIncludeData: (value: boolean) => void;
  data: string;
  setData: (value: string) => void;
  busy: boolean;
}) {
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={includeData}
          disabled={busy}
          onChange={(event) => {
            setIncludeData(event.target.checked);
          }}
        />
        设置初始 State Data
      </label>
      {includeData && (
        <label>
          初始 JSON value
          <textarea
            value={data}
            disabled={busy}
            onChange={(event) => {
              setData(event.target.value);
            }}
          />
        </label>
      )}
    </>
  );
}
