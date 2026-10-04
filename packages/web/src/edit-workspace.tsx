import { useEffect, useState, useSyncExternalStore } from "react";
import { type ObjectKind } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { type Context } from "./context.js";
import { Modal } from "./dialog.js";
import { ObjectDraft } from "./edit-controller.js";
import { DiscardDialog, LeaveDialog } from "./edit-dialogs.js";
import { EntryFields } from "./edit-fields.js";
import { KIND_LABELS, OBJECT_KINDS, type DraftEntry } from "./edit-patch.js";
import { DraftDiagnostics, DraftReceipt, DraftReview } from "./edit-review.js";
import { isObject, textField } from "./json.js";
import { type Records, type RecordSlot } from "./records.js";

export interface KnowledgeEditorProps {
  connection: Connection;
  context: Context;
  records: Records | undefined;
  ref: string | undefined;
  onClose: () => void;
  onCommitted?: (() => void) | undefined;
}

export interface ObjectEditorProps extends KnowledgeEditorProps {
  initialKind?: ObjectKind | undefined;
  slot?: RecordSlot | undefined;
}
const noSubscribe = () => () => {
  /* no record store */
};
const zeroSnapshot = () => 0;

function matchingSlot(props: ObjectEditorProps): RecordSlot | undefined {
  if (props.slot !== undefined) return props.slot;
  if (props.ref === undefined) return undefined;
  return props.records?.slots.find(
    (slot) =>
      slot.kind === "draft" &&
      slot.status !== "已删除" &&
      slot.data["subtype"] === "object" &&
      slot.data["baseState"] === props.context.state &&
      slot.data["branch"] === props.context.targetBranch &&
      slot.data["status"] !== "committed" &&
      Array.isArray(slot.data["entries"]) &&
      slot.data["entries"].some((entry) => isObject(entry) && entry["ref"] === props.ref)
  );
}

function createDraft(props: ObjectEditorProps): { draft: ObjectDraft | undefined; error: string } {
  try {
    return {
      draft: new ObjectDraft(props.connection, props.context, props.records, matchingSlot(props)),
      error: ""
    };
  } catch (error) {
    return { draft: undefined, error: error instanceof Error ? error.message : "草稿无法读取" };
  }
}

function DraftToolbar({ draft }: { draft: ObjectDraft }) {
  const [ref, setRef] = useState("");
  const [kind, setKind] = useState<ObjectKind>("knowledge-node");
  const [alias, setAlias] = useState("");
  return (
    <fieldset className="object-toolbar" disabled={!draft.editable}>
      <legend>同一个 Object Patch · {draft.data.entries.length}/100 targets</legend>
      <div className="actions">
        <label htmlFor={`target-ref-${draft.slot?.id ?? "new"}`}>已有 Object Ref</label>
        <input
          id={`target-ref-${draft.slot?.id ?? "new"}`}
          value={ref}
          onChange={(event) => {
            setRef(event.target.value);
          }}
          placeholder="n: / r: / node: / relationship: / domain:"
        />
        <button
          disabled={ref === "" || draft.loading}
          onClick={() => {
            void draft.addExisting(ref).then((added) => {
              if (added) setRef("");
            });
          }}
        >
          加入已有对象
        </button>
      </div>
      <div className="actions">
        <label htmlFor={`new-kind-${draft.slot?.id ?? "new"}`}>新增类型</label>
        <select
          id={`new-kind-${draft.slot?.id ?? "new"}`}
          value={kind}
          onChange={(event) => {
            const selected = OBJECT_KINDS.find((kind) => kind === event.target.value);
            if (selected !== undefined) setKind(selected);
          }}
        >
          {OBJECT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <label htmlFor={`alias-${draft.slot?.id ?? "new"}`}>请求内 alias</label>
        <input
          id={`alias-${draft.slot?.id ?? "new"}`}
          value={alias}
          onChange={(event) => {
            setAlias(event.target.value);
          }}
          placeholder="留空时生成唯一 alias"
        />
        <button
          onClick={() => {
            try {
              draft.addNew(kind, alias === "" ? crypto.randomUUID() : alias);
              setAlias("");
            } catch (error) {
              draft.error = error instanceof Error ? error.message : "alias 无效";
              draft.changed();
            }
          }}
        >
          新增{KIND_LABELS[kind]}
        </button>
      </div>
    </fieldset>
  );
}

function DraftEntryView({ draft, entry }: { draft: ObjectDraft; entry: DraftEntry }) {
  let deleteLabel = "删除对象";
  if (entry.base === "") deleteLabel = "移除新增对象";
  if (entry.deleted) deleteLabel = "保留对象";
  return (
    <section className="object-entry" aria-label={`${KIND_LABELS[entry.kind]} ${entry.ref}`}>
      <header className="section-header">
        <h3>
          {KIND_LABELS[entry.kind]} · {entry.base === "" ? "新增" : entry.ref}
        </h3>
        <button
          className="danger"
          disabled={!draft.editable}
          onClick={() => {
            draft.markDelete(entry.ref);
          }}
        >
          {deleteLabel}
        </button>
      </header>
      <code>{entry.ref}</code>
      {entry.deleted ? (
        <p className="warning">本次 Patch 明确删除此对象；依赖范围由提交时验证。</p>
      ) : (
        <>
          <EntryFields draft={draft} entry={entry} />
          <details
            open={
              draft.error !== "" &&
              draft.review?.issues.some((issue) => issue.ref === entry.ref) === true
            }
          >
            <summary>完整 YAML · 保留非法 / 未完成输入</summary>
            <label className="sr-only" htmlFor={`yaml-${encodeURIComponent(entry.ref)}`}>
              完整 YAML {entry.ref}
            </label>
            <textarea
              id={`yaml-${encodeURIComponent(entry.ref)}`}
              className="yaml-editor"
              value={entry.body}
              spellCheck={false}
              disabled={!draft.editable}
              rows={10}
              onChange={(event) => {
                draft.update(entry.ref, event.target.value);
              }}
            />
          </details>
        </>
      )}
    </section>
  );
}

export function ObjectDraftList({
  records,
  onOpen
}: {
  records: Records | undefined;
  onOpen: (slot: RecordSlot) => void;
}) {
  useSyncExternalStore(records?.subscribe ?? noSubscribe, records?.snapshot ?? zeroSnapshot);
  const drafts =
    records?.slots.filter(
      (slot) =>
        slot.kind === "draft" && slot.status !== "已删除" && slot.data["subtype"] === "object"
    ) ?? [];
  if (drafts.length === 0) return null;
  return (
    <details className="saved-drafts">
      <summary>已保留对象草稿 · {drafts.length}</summary>
      <div className="draft-list">
        {drafts.map((slot) => (
          <button
            key={slot.id}
            onClick={() => {
              onOpen(slot);
            }}
          >
            {textField(slot.data, "branch")} · {textField(slot.data, "status", "editing")} ·{" "}
            {slot.id.slice(0, 8)}
          </button>
        ))}
      </div>
    </details>
  );
}

function EditorBody({
  draft,
  onCommitted
}: {
  draft: ObjectDraft;
  onCommitted?: (() => void) | undefined;
}) {
  useSyncExternalStore(draft.subscribe, draft.snapshot);
  return (
    <div className="object-editor">
      <p className="draft-status" role="status">
        前端草稿 · {draft.slot?.status ?? "未保存"} · {draft.data.entries.length} 个对象
      </p>
      <p>
        Branch <strong>{draft.data.branch}</strong> · base <code>{draft.data.baseState}</code>
      </p>
      {draft.loading && <p role="status">正在读取并核对同一 State…</p>}
      {!draft.connection.writableStore && (
        <p className="warning">Web 保存库不可写；保留输入，依赖可靠保存的提交暂停。</p>
      )}
      {draft.slot?.error !== undefined && draft.slot.error !== "" && (
        <p className="error" role="alert">
          Web 保存：{draft.slot.error}
        </p>
      )}
      <DraftDiagnostics draft={draft} />
      {draft.data.status === "editing" && <DraftToolbar draft={draft} />}
      <div className="object-targets">
        {draft.data.entries.map((entry) => (
          <DraftEntryView key={entry.ref} draft={draft} entry={entry} />
        ))}
      </div>
      {draft.data.status === "editing" && (
        <div className="actions">
          <button
            disabled={draft.busy}
            onClick={() => {
              void draft.save();
            }}
          >
            保存草稿
          </button>
          <button
            disabled={draft.loading || draft.busy}
            onClick={() => {
              void draft.verify();
            }}
          >
            核对原基底与 Branch head
          </button>
          <button
            className="primary"
            disabled={!draft.editable || draft.data.entries.length === 0}
            onClick={() => {
              draft.preview();
            }}
          >
            查看 Patch
          </button>
        </div>
      )}
      <DraftReview draft={draft} onCommitted={onCommitted} />
      <DraftReceipt draft={draft} />
    </div>
  );
}

function PreviousInputs({ entries }: { entries: DraftEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <details>
      <summary>原草稿 · 手动对照迁移</summary>
      {entries.map((entry) => (
        <section key={entry.ref}>
          <h4>{entry.ref}</h4>
          <pre>{entry.body}</pre>
        </section>
      ))}
    </details>
  );
}

function useDraftStart(draft: ObjectDraft | undefined, props: ObjectEditorProps) {
  useEffect(() => {
    if (draft === undefined) return;
    void draft.start(props.ref, props.initialKind);
    return () => {
      draft.dispose();
    };
  }, [draft, props.ref, props.initialKind]);
}

export function ObjectEditorModal(props: ObjectEditorProps) {
  const [editor, setEditor] = useState(() => createDraft(props));
  const [leaving, setLeaving] = useState(false);
  const [previous, setPrevious] = useState<DraftEntry[]>([]);
  const [discarding, setDiscarding] = useState(false);
  const draft = editor.draft;
  useSyncExternalStore(draft?.subscribe ?? noSubscribe, draft?.snapshot ?? zeroSnapshot);
  useDraftStart(draft, props);
  const close = () => {
    if (
      draft?.slot?.dirty === true ||
      (draft !== undefined && draft.slot === undefined && draft.data.entries.length > 0)
    )
      setLeaving(true);
    else props.onClose();
  };
  const rebuild = async () => {
    if (draft === undefined || draft.busy || props.connection.client === undefined) return;
    const branch = `branch/${draft.data.branch}`;
    if (!(await props.context.select(branch))) return;
    await props.context.observe();
    if (!props.context.editable) return;
    setPrevious(draft.data.entries.map((entry) => ({ ...entry })));
    const next = new ObjectDraft(props.connection, props.context, props.records);
    setEditor({ draft: next, error: "" });
  };
  return (
    <>
      <Modal title="对象草稿" onClose={close} className="object-dialog">
        {draft === undefined ? (
          <p role="alert">{editor.error}</p>
        ) : (
          <EditorBody draft={draft} onCommitted={props.onCommitted} />
        )}
        <PreviousInputs entries={previous} />
        {draft !== undefined &&
          !draft.busy &&
          !draft.canSubmit &&
          draft.data.status !== "committed" && (
            <button
              disabled={props.connection.client === undefined}
              onClick={() => {
                void rebuild();
              }}
            >
              对照新基底手动重建
            </button>
          )}
        <ObjectDraftList
          records={props.records}
          onOpen={(slot) => {
            if (draft?.busy === true) return;
            setEditor(createDraft({ ...props, slot }));
          }}
        />
        {draft?.editable === true && (
          <button
            className="danger"
            onClick={() => {
              setDiscarding(true);
            }}
          >
            放弃草稿
          </button>
        )}
      </Modal>
      {leaving && draft !== undefined && (
        <LeaveDialog
          draft={draft}
          onClose={props.onClose}
          onCancel={() => {
            setLeaving(false);
          }}
        />
      )}
      {discarding && draft !== undefined && (
        <DiscardDialog
          draft={draft}
          onClose={props.onClose}
          onCancel={() => {
            setDiscarding(false);
          }}
        />
      )}
    </>
  );
}

export function KnowledgeEditor(props: KnowledgeEditorProps) {
  return <ObjectEditorModal {...props} />;
}
