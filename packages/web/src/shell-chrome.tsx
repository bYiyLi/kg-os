import { useEffect, useState } from "react";
import { Modal } from "./dialog.js";
import { shorten } from "./json.js";
import { type Workspace } from "./workspace.js";

export function ConnectionDialog({
  workspace,
  onClose
}: {
  workspace: Workspace;
  onClose: () => void;
}) {
  const [token, setToken] = useState("");
  const { connection } = workspace;
  async function submit() {
    if (connection.connecting || token.trim() === "") return;
    const entered = token;
    setToken("");
    await workspace.connect(entered);
    if (connection.client !== undefined) onClose();
  }
  return (
    <Modal title="连接当前 Runtime" onClose={onClose}>
      <p>
        当前 endpoint：<code>{connection.endpoint}</code>
      </p>
      <p>输入此 Instance 的凭证连接。凭证只保留在本窗口内存中，刷新后需要重新连接。</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="credential">访问凭证</label>
        <input
          id="credential"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
          }}
          autoFocus
        />
        <p role="status">
          {connection.status}
          {workspace.restoring && " · 正在恢复工作位置"}
        </p>
        <div className="actions">
          <button type="button" onClick={onClose}>
            暂不连接
          </button>
          <button
            className="primary"
            disabled={token.trim() === "" || connection.connecting || workspace.restoring}
          >
            连接
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ContextBar({ workspace }: { workspace: Workspace }) {
  const context = workspace.context;
  const [input, setInput] = useState(context.inputRef);
  useEffect(() => {
    setInput(context.inputRef);
  }, [context.inputRef]);
  return (
    <div className="context-bar">
      <label>
        浏览版本
        <input
          aria-label="浏览版本"
          list="refs"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
          }}
        />
      </label>
      <datalist id="refs">
        {context.branches.map((ref) => (
          <option key={`branch/${ref.name}`} value={`branch/${ref.name}`} />
        ))}
        {context.tags.map((ref) => (
          <option key={`tag/${ref.name}`} value={`tag/${ref.name}`} />
        ))}
      </datalist>
      <button
        disabled={workspace.connection.client === undefined || context.resolving}
        onClick={() => {
          void workspace.select(input);
        }}
      >
        {context.resolving ? "正在解析" : "选择版本"}
      </button>
      <span className="badge" title={context.state}>
        State {shorten(context.state) || "未选择"}
      </span>
      <button
        disabled={workspace.connection.client === undefined}
        onClick={() => {
          void context.observe();
        }}
      >
        检查更新
      </button>
      <span className="muted">
        {context.observedAt === 0
          ? "尚未观察引用"
          : `观察于 ${new Date(context.observedAt).toLocaleTimeString()}`}
      </span>
      {(context.headChanged || context.refMissing) && (
        <p className="notice">
          {context.refMissing
            ? "引用已不存在；原 State 仍保留供只读浏览"
            : "引用目标已变化，当前仍读取固定 State"}
          {!context.refMissing && (
            <button
              onClick={() => {
                void workspace.select(context.inputRef);
              }}
            >
              显式加载最新目标
            </button>
          )}
        </p>
      )}
      {context.observationError && (
        <p className="warning">引用信息可能过期：{context.observationError}</p>
      )}
      {context.switchError && (
        <p role="alert">
          版本解析失败，保留原 State：{context.switchError}
          <button
            onClick={() => {
              context.resumeCurrent();
            }}
          >
            恢复原上下文
          </button>
        </p>
      )}
    </div>
  );
}

export function useWorkspaceLifecycle(workspace: Workspace) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let failures = 0;
    async function observe() {
      clearTimeout(timer);
      if (
        stopped ||
        document.visibilityState === "hidden" ||
        workspace.connection.client === undefined
      )
        return;
      await workspace.context.observe();
      failures = workspace.context.observationError === "" ? 0 : Math.min(failures + 1, 4);
      const schedule = () => {
        if (!stopped)
          timer = setTimeout(
            () => {
              void observe();
            },
            15_000 * 2 ** failures
          );
      };
      schedule();
    }
    const focus = () => {
      void observe();
    };
    const unsubscribe = workspace.connection.subscribe(focus);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const leave = (event: BeforeUnloadEvent) => {
      if (workspace.records?.dirty === true) event.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("beforeunload", leave);
    };
  }, [workspace]);
}
