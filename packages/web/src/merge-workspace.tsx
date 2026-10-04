import { useEffect, useState, useSyncExternalStore } from "react";

import { type Context } from "./context.js";
import { type MergeController } from "./merge-controller.js";
import { MergeConflicts } from "./merge-conflict-view.js";
import { ValueView } from "./value-view.js";

function MergeStart({ model, context }: { model: MergeController; context: Context }) {
  const [branch, setBranch] = useState(context.targetBranch);
  const [source, setSource] = useState(context.state);
  useEffect(() => {
    if (model.startAttempt !== undefined) {
      setBranch(model.startAttempt.branch);
      setSource(model.startAttempt.source);
    }
  }, [model.startAttempt]);
  return (
    <section className="merge-start">
      <h3>开始新 Merge Session</h3>
      <label>
        目标 Branch
        <select
          disabled={model.busy || model.sending}
          value={branch}
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
      <label>
        来源 StateRef
        <input
          disabled={model.busy || model.sending}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
          }}
        />
      </label>
      <p>start 不创建 State、不移动 Branch；新 Session 使用后端实际 pinned inputs。</p>
      <button
        disabled={
          model.busy ||
          model.sending ||
          model.unknown ||
          source === "" ||
          !context.branches.some((ref) => ref.name === branch)
        }
        onClick={() => {
          void model.start(branch, source);
        }}
      >
        {model.headMoved ? "以当前 head 明确建立新 Session" : "开始 Merge"}
      </button>
      {model.headMoved && <p>原 Session 和方案仍保留；新 Session 不自动应用旧选择。</p>}
    </section>
  );
}

function MergeSessionList({ model }: { model: MergeController }) {
  const [token, setToken] = useState("");
  const [page, setPage] = useState(0);
  const start = page * 20;
  return (
    <details className="merge-session-list">
      <summary>重开已存在 Session</summary>
      <label>
        Session token
        <input
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
          }}
        />
      </label>
      <button
        disabled={model.busy || model.sending || token === ""}
        onClick={() => {
          void model.open(token);
        }}
      >
        读取 Session
      </button>
      <button
        disabled={model.busy || model.sending}
        onClick={() => {
          void model.list();
        }}
      >
        刷新 Session 列表
      </button>
      {model.sessions.slice(start, start + 20).map((session) => (
        <article key={session.session}>
          <button
            disabled={model.sending}
            onClick={() => {
              void model.open(session.session);
            }}
          >
            {session.branch} · revision {session.revision} · {session.session}
          </button>
          <code>
            {session.targetState} ← {session.sourceState}
          </code>
        </article>
      ))}
      <button
        disabled={page === 0}
        onClick={() => {
          setPage(page - 1);
        }}
      >
        上一 Session 片段
      </button>
      <button
        disabled={start + 20 >= model.sessions.length}
        onClick={() => {
          setPage(page + 1);
        }}
      >
        下一 Session 片段
      </button>
      <button
        disabled={model.busy || model.sending || model.listCursor === undefined}
        onClick={() => {
          void model.list(true);
        }}
      >
        加载更多 Session
      </button>
    </details>
  );
}

function SessionActions({ model }: { model: MergeController }) {
  const author = model.draft?.author ?? "";
  const message = model.draft?.message ?? "";
  return (
    <section className="merge-session-actions">
      <p>
        未发送选择 {model.draft?.choices.size ?? 0} 条 · {model.draft?.slot?.status ?? "未建立草稿"}
      </p>
      {model.draft?.slot?.error !== undefined && model.draft.slot.error !== "" && (
        <p role="alert">{model.draft.slot.error}</p>
      )}
      <button
        disabled={!model.actionable || (model.draft?.choices.size ?? 0) === 0}
        onClick={() => {
          void model.resolve();
        }}
      >
        确认保存当前解决方案 · resolve
      </button>
      <button
        disabled={model.busy || model.sending}
        onClick={() => {
          void model.check();
        }}
      >
        重读 Session / refs
      </button>
      <button
        disabled={model.busy || model.sending}
        onClick={() => {
          model.compare();
        }}
      >
        已比较当前 conflict identity
      </button>
      <label>
        Merge author
        <input
          disabled={model.sending || model.unknown}
          value={author}
          onChange={(event) => {
            model.editMetadata(event.target.value, message);
          }}
        />
      </label>
      <label>
        Merge 提交说明
        <input
          disabled={model.sending || model.unknown}
          value={message}
          onChange={(event) => {
            model.editMetadata(author, event.target.value);
          }}
        />
      </label>
      <p>只有实际 merged 创建新 Commit 并写入 author / message。</p>
      <button
        disabled={
          !model.actionable ||
          model.session?.unresolved !== 0 ||
          (model.draft?.choices.size ?? 0) > 0
        }
        onClick={() => {
          void model.finalize(author, message);
        }}
      >
        确认完成合并 · finalize
      </button>
      <button
        className="danger"
        disabled={!model.abortable}
        onClick={() => {
          void model.abort();
        }}
      >
        明确放弃合并 · abort
      </button>
    </section>
  );
}

function MergeOutcome({ model, context }: { model: MergeController; context: Context }) {
  const result = model.result;
  if (result === undefined) return null;
  const descriptions: Record<string, string> = {
    up_to_date: "已包含来源变化，Branch 保持原目标，没有创建新 State。",
    fast_forward: "仅推进目标 Branch 至来源 State，没有创建新 State。",
    merged: "创建真实两 parent State 并推进目标 Branch。"
  };
  return (
    <section className="merge-outcome" role="status">
      <h3>实际 outcome · {result.status}</h3>
      <p>{descriptions[result.status] ?? "请核对返回的实际 outcome"}</p>
      <code>{result.state}</code>
      <ValueView
        value={{
          targetState: result.targetState,
          sourceState: result.sourceState,
          state: result.state
        }}
      />
      {model.resultState !== undefined ? (
        <div>
          <h4>从最终 State 实际读取的 parents</h4>
          {model.resultState.parents.map((parent) => (
            <p key={parent}>
              <code>{parent}</code>
            </p>
          ))}
        </div>
      ) : (
        <p>最终 State 的 parents 尚未读取成功；不根据 outcome 补造 parent。</p>
      )}
      <button
        onClick={() => {
          void context.select(result.state);
        }}
      >
        查看 final State
      </button>
    </section>
  );
}

export function MergeWorkspace({ model, context }: { model: MergeController; context: Context }) {
  useSyncExternalStore(model.subscribe, model.snapshot);
  useSyncExternalStore(model.connection.subscribe, model.connection.snapshot);
  useSyncExternalStore(context.subscribe, context.snapshot);
  useSyncExternalStore(
    model.records?.subscribe ?? (() => () => undefined),
    model.records?.snapshot ?? (() => 0)
  );
  useEffect(() => {
    if (model.connection.client === undefined) model.suspend();
    else if (model.session !== undefined && model.result === undefined) void model.check();
    else void model.restore();
  }, [model, model.connection.client]);
  useEffect(() => {
    void model.adoptRecord();
  }, [model, model.draft?.slot?.adoption, model.sending]);
  const session = model.session;
  return (
    <div className="merge-workspace">
      <MergeStart model={model} context={context} />
      <MergeSessionList model={model} />
      {session === undefined && model.recovery !== undefined && (
        <section>
          <h3>原 Session 的已保存输入</h3>
          <p>原 Session 尚未核对；保留原始文本供比较，不自动应用到新 Session。</p>
          <ValueView value={model.recovery} />
        </section>
      )}
      {session !== undefined && (
        <>
          <section className="merge-pinned">
            <h3>Session · {session.status}</h3>
            <p>
              token <code>{session.session}</code> · revision {session.revision} · unresolved{" "}
              {session.unresolved}
            </p>
            <p>
              Target Branch <strong>{session.branch}</strong>
            </p>
            <code>{session.targetState}</code>
            <p>Source pinned State</p>
            <code>{session.sourceState}</code>
            <p>公共接口未提供共同基底 State；Base value 只按具体 conflict 显示。</p>
          </section>
          {model.result === undefined && (
            <>
              <MergeConflicts
                key={`${session.session}/${String(session.revision)}`}
                model={model}
              />
              <SessionActions model={model} />
            </>
          )}
        </>
      )}
      <MergeOutcome model={model} context={context} />
      <UnknownMerge model={model} />
      {model.busy || model.sending ? <p role="status">正在读取 / 保存本次操作</p> : null}
      {model.error !== "" && <p role="alert">{model.error}</p>}
      {model.notice !== "" && <p role="status">{model.notice}</p>}
      <p>关闭视图保留 Session；只有明确放弃才调用 abort。</p>
    </div>
  );
}

function UnknownMerge({ model }: { model: MergeController }) {
  return (
    <>
      {model.unknown && (
        <>
          <p role="status">结果待核对，保留原输入；不重复 resolve / finalize / abort。</p>
          {model.startAttempt !== undefined && (
            <>
              <ValueView value={model.startAttempt} />
              <button
                disabled={model.busy || model.sending || model.connection.client === undefined}
                onClick={() => {
                  void model.check();
                }}
              >
                核对 start 结果 · Session / refs
              </button>
            </>
          )}
          <button
            disabled={!model.canAcknowledge}
            onClick={() => {
              model.acknowledge();
            }}
          >
            已核对结果，继续比较
          </button>
        </>
      )}{" "}
    </>
  );
}
