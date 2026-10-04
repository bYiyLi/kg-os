import { useRef, useState } from "react";

import { Modal } from "./dialog.js";
import { type FrameSnapshot } from "./frame.js";
import { parseObject, shorten } from "./json.js";
import { QueryLibrary } from "./query-library.js";
import { type Workspace } from "./workspace.js";

function useQueryRun(workspace: Workspace) {
  const [error, setError] = useState("");
  const [execution, setExecution] = useState<FrameSnapshot>();
  const [checking, setChecking] = useState(false);
  const checkingNow = useRef(false);
  const confirmed = useRef<FrameSnapshot | undefined>(undefined);
  async function run() {
    const { context, connection } = workspace;
    if (checkingNow.current || !context.runnable || workspace.statement.trim() === "") return;
    setError("");
    try {
      const snapshot: FrameSnapshot = {
        mode: workspace.mode,
        statement: workspace.statement,
        params: parseObject(workspace.paramsText),
        paramsText: workspace.paramsText,
        inputRef: context.inputRef
      };
      if (snapshot.mode === "query") {
        snapshot.readState = context.state;
        workspace.engine.run(snapshot);
        return;
      }
      snapshot.branch = context.targetBranch;
      checkingNow.current = true;
      setChecking(true);
      await context.observe();
      const head = context.branches.find((branch) => branch.name === snapshot.branch)?.state;
      if (context.observationError !== "" || head === undefined || connection.client === undefined)
        throw new Error("目标 Branch 未能重新核对，请检查连接和引用");
      snapshot.observedHead = head;
      setExecution(snapshot);
    } catch (failure) {
      setError(connection.failure(failure));
    } finally {
      checkingNow.current = false;
      setChecking(false);
    }
  }
  function confirm() {
    if (
      execution === undefined ||
      confirmed.current === execution ||
      workspace.connection.client === undefined
    )
      return;
    confirmed.current = execution;
    setExecution(undefined);
    workspace.engine.run(execution);
  }
  return {
    error,
    execution,
    checking,
    run,
    confirm,
    close: () => {
      setExecution(undefined);
    }
  };
}

function QueryInputs({
  workspace,
  checking,
  onRun
}: {
  workspace: Workspace;
  checking: boolean;
  onRun: () => void;
}) {
  const { context } = workspace;
  let label = workspace.mode === "query" ? "运行查询" : "预览高级执行";
  if (checking) label = "正在核对 Branch";
  return (
    <>
      <QueryHeading workspace={workspace} />
      <label className="sr-only" htmlFor="statement">
        Cypher 语句
      </label>
      <textarea
        id="statement"
        spellCheck={false}
        value={workspace.statement}
        rows={3}
        onChange={(event) => {
          workspace.edit(event.target.value);
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            if (!event.repeat) onRun();
          }
        }}
      />
      <div className="editor-bottom">
        <details>
          <summary>
            参数 JSON {workspace.editor !== undefined && `· ${workspace.editor.status}`}
          </summary>
          <label htmlFor="params">参数对象</label>
          <textarea
            id="params"
            value={workspace.paramsText}
            rows={3}
            spellCheck={false}
            onChange={(event) => {
              workspace.edit(workspace.statement, event.target.value);
            }}
          />
        </details>
        {workspace.mode === "execute" && (
          <label>
            目标 Branch
            <input
              value={context.targetBranch}
              onChange={(event) => {
                context.targetBranch = event.target.value;
                context.changed();
              }}
            />
          </label>
        )}
        <button
          className="primary"
          disabled={!context.runnable || checking || workspace.statement.trim() === ""}
          onClick={onRun}
        >
          {label}
        </button>
      </div>
    </>
  );
}

function ExecuteConfirmation({
  snapshot,
  onClose,
  onConfirm
}: {
  snapshot: FrameSnapshot;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="确认高级执行" onClose={onClose}>
      <p>
        目标 Branch：<strong>{snapshot.branch}</strong>
      </p>
      <p className="state-ref">观察到的 head：{snapshot.observedHead}</p>
      <p>直接 Cypher 使用底层事务约定；此观察值不能锁定 Branch，取消或断流后写入结果需要核对。</p>
      <pre>{snapshot.statement}</pre>
      <pre>{snapshot.paramsText ?? JSON.stringify(snapshot.params, null, 2)}</pre>
      <div className="actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" onClick={onConfirm}>
          确认执行一次
        </button>
      </div>
    </Modal>
  );
}

export function QueryEditor({ workspace }: { workspace: Workspace }) {
  const run = useQueryRun(workspace);
  return (
    <section className="query-editor" aria-label="新查询">
      <QueryInputs
        workspace={workspace}
        checking={run.checking}
        onRun={() => {
          void run.run();
        }}
      />
      {run.error && (
        <p role="alert" className="warning">
          {run.error}
        </p>
      )}
      <QueryLibrary workspace={workspace} />
      {run.execution !== undefined && (
        <ExecuteConfirmation snapshot={run.execution} onClose={run.close} onConfirm={run.confirm} />
      )}
    </section>
  );
}

function QueryHeading({ workspace }: { workspace: Workspace }) {
  const { context } = workspace;
  return (
    <div className="editor-heading">
      <h2>新查询</h2>
      <span className="muted" title={context.state}>
        读取 State {shorten(context.state) || "未选择"}
      </span>
      <label>
        模式
        <select
          value={workspace.mode}
          onChange={(event) => {
            workspace.edit(
              workspace.statement,
              workspace.paramsText,
              event.target.value === "execute" ? "execute" : "query"
            );
          }}
        >
          <option value="query">只读查询</option>
          <option value="execute">高级执行</option>
        </select>
      </label>
    </div>
  );
}
