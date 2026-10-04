import { PRODUCT_NAME } from "@kgos/sdk";
import { useState, useSyncExternalStore } from "react";

import { Context } from "./context.js";
import { Modal } from "./dialog.js";
import { ObjectDraftList, ObjectEditorModal } from "./edit-workspace.js";
import { FrameView } from "./frame-view.js";
import { OntologyWorkspace } from "./ontology-workspace.js";
import { QueryEditor } from "./query-editor.js";
import { ConnectionDialog, ContextBar, useWorkspaceLifecycle } from "./shell-chrome.js";
import { Recovery } from "./recovery.js";
import { VersionPanel } from "./version-panel.js";
import { Workspace } from "./workspace.js";
import { type RecordSlot } from "./records.js";

interface EditSelection {
  ref?: string;
  context: Context;
  slot?: RecordSlot;
}

export function Shell({ workspace: supplied }: { workspace?: Workspace }) {
  const [workspace] = useState(
    () =>
      supplied ??
      new Workspace(typeof location === "undefined" ? "http://127.0.0.1" : location.origin)
  );
  useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  useWorkspaceLifecycle(workspace);
  const [connecting, setConnecting] = useState(false);
  const [edit, setEdit] = useState<EditSelection>();
  const [help, setHelp] = useState(false);
  const { connection, context, records } = workspace;
  const committed = () => {
    void context.observe();
  };
  function editObject(ref?: string, state?: string) {
    if (state === undefined || state === context.state) {
      setEdit({ ...(ref === undefined ? {} : { ref }), context });
      return;
    }
    const pinned = new Context(connection);
    pinned.state = state;
    pinned.inputRef = state;
    pinned.targetBranch = context.targetBranch;
    pinned.branches = context.branches;
    pinned.tags = context.tags;
    setEdit({ ...(ref === undefined ? {} : { ref }), context: pinned });
  }
  return (
    <div className="app-shell">
      <AppHeader
        workspace={workspace}
        onConnect={() => {
          setConnecting(true);
        }}
        onHelp={() => {
          setHelp(true);
        }}
      />
      <ContextBar workspace={workspace} />
      {workspace.error && (
        <p className="warning" role="alert">
          {workspace.error}
        </p>
      )}
      {connection.info !== undefined && connection.info.storageStatus !== "ready" && (
        <p className="notice">
          工作区保存库 {connection.info.storageStatus}：
          {connection.info.error?.message ?? "当前保存不可用，已输入内容留在本窗口"}
        </p>
      )}
      <Recovery records={records} />
      <ObjectDraftList
        records={records}
        onOpen={(slot) => {
          setEdit({ context, slot });
        }}
      />
      <div className="workspace-layout">
        <VersionPanel connection={connection} context={context} records={records} />
        <WorkspaceMain workspace={workspace} onEdit={editObject} />
      </div>
      {connecting && (
        <ConnectionDialog
          workspace={workspace}
          onClose={() => {
            setConnecting(false);
          }}
        />
      )}
      {edit !== undefined && (
        <EditOverlay
          workspace={workspace}
          edit={edit}
          onClose={() => {
            setEdit(undefined);
          }}
          onCommitted={committed}
        />
      )}
      {help && (
        <HelpDialog
          onClose={() => {
            setHelp(false);
          }}
        />
      )}
    </div>
  );
}

function EditOverlay({
  workspace,
  edit,
  onClose,
  onCommitted
}: {
  workspace: Workspace;
  edit: EditSelection;
  onClose: () => void;
  onCommitted: () => void;
}) {
  return (
    <ObjectEditorModal
      connection={workspace.connection}
      context={edit.context}
      records={workspace.records}
      ref={edit.ref}
      slot={edit.slot}
      onClose={onClose}
      onCommitted={onCommitted}
    />
  );
}

function AppHeader({
  workspace,
  onConnect,
  onHelp
}: {
  workspace: Workspace;
  onConnect: () => void;
  onHelp: () => void;
}) {
  const { connection } = workspace;
  return (
    <header className="app-header">
      <a className="brand" href="#workspace" aria-label="KG OS 工作区">
        <span aria-hidden="true">◇</span>
        {PRODUCT_NAME}
      </a>
      <span className="connection-status" role="status">
        {connection.status}
      </span>
      <div className="actions">
        <button
          onClick={() => {
            onConnect();
          }}
        >
          {connection.client === undefined ? "连接 Runtime" : "重新连接"}
        </button>
        {connection.client !== undefined && (
          <button
            onClick={() => {
              workspace.disconnect();
            }}
          >
            断开
          </button>
        )}
        <button
          onClick={() => {
            onHelp();
          }}
        >
          使用说明
        </button>
      </div>
    </header>
  );
}

function WorkspaceMain({
  workspace,
  onEdit
}: {
  workspace: Workspace;
  onEdit: (ref?: string, state?: string) => void;
}) {
  const { connection, context, records } = workspace;
  const committed = () => {
    void context.observe();
  };
  return (
    <main id="workspace">
      <nav className="tabs" aria-label="工作区">
        <button
          aria-pressed={workspace.tab === "knowledge"}
          onClick={() => {
            workspace.switchTab("knowledge");
          }}
        >
          知识图谱
        </button>
        <button
          aria-pressed={workspace.tab === "ontology"}
          onClick={() => {
            workspace.switchTab("ontology");
          }}
        >
          本体图谱
        </button>
      </nav>
      {workspace.tab === "ontology" ? (
        <OntologyWorkspace
          connection={connection}
          context={context}
          records={records}
          onCommitted={committed}
        />
      ) : (
        <KnowledgeWorkspace workspace={workspace} onEdit={onEdit} />
      )}
    </main>
  );
}

function KnowledgeWorkspace({
  workspace,
  onEdit
}: {
  workspace: Workspace;
  onEdit: (ref?: string, state?: string) => void;
}) {
  const { connection, context, engine, records } = workspace;
  return (
    <>
      <QueryEditor workspace={workspace} />
      <div className="actions create-tools">
        <button
          disabled={!context.editable}
          onClick={() => {
            onEdit();
          }}
        >
          新建知识对象
        </button>
        <button
          disabled={connection.client === undefined}
          onClick={() => {
            void records?.load("frame", true).then(() => {
              engine.restore();
            });
          }}
        >
          加载更多保存的帧
        </button>
      </div>
      <div className="frame-stream" aria-label="独立查询结果帧">
        {engine.frames.map((frame) => (
          <FrameView
            key={frame.localId}
            frame={frame}
            engine={engine}
            context={context}
            onEdit={onEdit}
            onCopy={(source) => {
              workspace.edit(
                source.request.statement,
                source.request.paramsText ?? JSON.stringify(source.request.params, null, 2),
                source.request.mode
              );
            }}
          />
        ))}
        {engine.frames.every((frame) => frame.closed) && (
          <div className="empty-state">
            <h2>在图谱中开始探索</h2>
            <p>连接后选择一个版本，运行查询；每次结果保留在自己的 State。</p>
          </div>
        )}
      </div>
    </>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <>
      {
        <Modal
          title="使用说明"
          onClose={() => {
            onClose();
          }}
        >
          <p>
            先连接当前 Runtime，再选择 Branch、Tag 或完整 commit。只读查询不会跟随 Branch
            更新；每次运行创建独立结果帧。
          </p>
          <p>
            选择对象可查看属性和展开邻居。编辑先保存草稿、预览一次
            Patch，再明确提交；提交后按需加载最新 Branch。
          </p>
          <p>凭证不写入保存库。刷新后重新连接，已保存输入、草稿和帧位置会恢复。</p>
        </Modal>
      }
    </>
  );
}
