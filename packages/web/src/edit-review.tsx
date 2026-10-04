import { useEffect, useRef } from "react";

import { type DraftPreview, type ObjectDraft } from "./edit-controller.js";
import { fieldId } from "./edit-fields.js";
import { KIND_LABELS, targetRef } from "./edit-patch.js";
import { ValueView } from "./value-view.js";

function focusIssue(ref: string, path: string[]) {
  const field =
    document.getElementById(fieldId(ref, path)) ??
    document.getElementById(`yaml-${encodeURIComponent(ref)}`);
  const details = field?.closest("details");
  if (details instanceof HTMLDetailsElement) details.open = true;
  field?.focus();
}

function DraftErrors({ review }: { review: DraftPreview }) {
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    errorRef.current?.focus();
  }, [review]);
  return (
    <div role="alert" tabIndex={-1} ref={errorRef} aria-label="前端检查失败">
      <h4>前端检查失败 · {review.issues.length}</h4>
      <ul>
        {review.issues.map((issue, index) => {
          const path = issue.path
            .split("/")
            .slice(1)
            .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
          return (
            <li key={index}>
              <a
                href={`#${fieldId(issue.ref, path)}`}
                onClick={(event) => {
                  event.preventDefault();
                  focusIssue(issue.ref, path);
                }}
              >
                {issue.ref} {issue.path}
              </a>
              ：{issue.message}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DraftReview({
  draft,
  onCommitted
}: {
  draft: ObjectDraft;
  onCommitted?: (() => void) | undefined;
}) {
  const review = draft.review;
  if (review === undefined) return null;
  return (
    <section className="patch-review" aria-label="Patch 预览">
      <header className="section-header">
        <h3>预览本次具体变化</h3>
        <button
          disabled={draft.busy}
          onClick={() => {
            draft.review = undefined;
            draft.changed();
          }}
        >
          返回编辑
        </button>
      </header>
      <p>
        target Branch <strong>{draft.data.branch}</strong>
      </p>
      <details open>
        <summary>immutable baseState</summary>
        <code>{draft.data.baseState}</code>
      </details>
      <p className="notice">预览由前端生成；最终 Knowledge / Schema 约束在提交时验证。</p>
      {review.issues.length > 0 ? (
        <DraftErrors review={review} />
      ) : (
        <>
          <p className="draft-status">前端检查通过 · {review.entries.length} 个明确 target</p>
          {review.entries.map((entry) => (
            <section className="patch-target" key={entry.ref}>
              <h4>
                {KIND_LABELS[entry.kind]} · {entry.ref} · {entryOperation(entry)}
              </h4>
              {!entry.deleted && targetRef(entry) !== entry.ref && (
                <p>identifying rename → {targetRef(entry)}</p>
              )}
              <details>
                <summary>YAML before / after</summary>
                <div className="yaml-compare">
                  <section>
                    <h5>Before · 原 State</h5>
                    <pre>{entry.base === "" ? "（不存在）" : entry.base}</pre>
                  </section>
                  <section>
                    <h5>After · 草稿</h5>
                    <pre>{entry.deleted ? "（明确删除）" : entry.body}</pre>
                  </section>
                </div>
              </details>
            </section>
          ))}
          {review.notes.length > 0 && (
            <ul className="known-impact">
              {review.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          )}
          <details>
            <summary>完整 Git Extended Diff</summary>
            <pre className="patch-text">{review.patch}</pre>
          </details>
          <div className="actions">
            <button
              className="primary"
              disabled={!draft.canSubmit}
              onClick={() => {
                void draft.submit().then((receipt) => {
                  if (receipt !== undefined) onCommitted?.();
                });
              }}
            >
              {draft.busy ? "正在保存并提交…" : `确认提交到 ${draft.data.branch}`}
            </button>
            <small>确认后可靠保存同版草稿，再发送一次 Patch。</small>
          </div>
        </>
      )}
    </section>
  );
}

function entryOperation(entry: { deleted: boolean; base: string }): string {
  if (entry.deleted) return "删除";
  return entry.base === "" ? "新增" : "修改";
}

export function DraftReceipt({ draft }: { draft: ObjectDraft }) {
  const receipt = draft.data.receipt;
  if (receipt === undefined) return null;
  const noOp = receipt.state === draft.data.baseState;
  return (
    <section className="draft-receipt" role="status" aria-label="真实提交回执">
      <h3>
        {noOp ? "无变化 · no-op" : "知识已提交"} ·{" "}
        {draft.receiptSaved ? "回执已保存" : "Web 回执未保存"}
      </h3>
      <p>
        {noOp ? "返回原 State，没有创建知识 State。" : "返回实际 State，原查询帧保留原 State。"}
      </p>
      <code>{receipt.state}</code>
      {receipt.created.length > 0 && (
        <ul>
          {receipt.created.map((created) => (
            <li key={`${created.kind}:${created.alias}`}>
              {created.kind} · alias {created.alias} → {created.ref}
            </li>
          ))}
        </ul>
      )}
      {receipt.transitions.length > 0 && (
        <ul>
          {receipt.transitions.map((transition) => (
            <li key={transition.from}>
              {transition.from} → {transition.to}
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button
          onClick={() => {
            void draft.context.select(receipt.state);
          }}
        >
          查看返回 State
        </button>
        <button
          onClick={() => {
            void draft.context.select(`branch/${draft.data.branch}`);
          }}
        >
          显式刷新 Branch
        </button>
        {!draft.receiptSaved && (
          <button
            disabled={draft.busy}
            onClick={() => {
              void draft.saveReceipt();
            }}
          >
            重试保存回执
          </button>
        )}
      </div>
    </section>
  );
}

export function DraftDiagnostics({ draft }: { draft: ObjectDraft }) {
  return (
    <>
      {draft.error !== "" && (
        <p className="error" role="alert">
          {draft.error}
        </p>
      )}
      {draft.backendDetails !== undefined && (
        <details>
          <summary>后端公开 Ref / path 诊断</summary>
          <ValueView value={draft.backendDetails} />
        </details>
      )}
      {draft.data.status === "unknown" && (
        <section className="unknown-outcome">
          <h3>写入结果待核对</h3>
          <p>
            本草稿保留全部输入。先核对当前 Branch、原对象及有界历史；新增 alias
            没有实际回执时无法确认正式 Ref。
          </p>
          <button
            disabled={draft.loading || draft.connection.client === undefined}
            onClick={() => {
              void draft.reconcile();
            }}
          >
            核对 Branch / 对象 / 历史
          </button>
          {draft.evidence !== undefined && (
            <details open>
              <summary>已读取的核对资料 · 有界范围</summary>
              <ValueView value={draft.evidence} />
            </details>
          )}
        </section>
      )}
    </>
  );
}
