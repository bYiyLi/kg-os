import { useState } from "react";

import { Modal } from "./dialog.js";
import { textField } from "./json.js";
import { type RecordSlot } from "./records.js";
import { type Workspace } from "./workspace.js";

export function QueryLibrary({ workspace }: { workspace: Workspace }) {
  const [name, setName] = useState("");
  const [page, setPage] = useState(0);
  const [removed, setRemoved] = useState<RecordSlot>();
  const records = workspace.records;
  const queries =
    records?.slots.filter((slot) => slot.kind === "query" && slot.status !== "已删除") ?? [];
  const start = Math.min(page * 50, Math.max(0, Math.floor((queries.length - 1) / 50) * 50));
  return (
    <details className="query-library">
      <summary>收藏查询（{queries.length}）</summary>
      <div className="actions">
        <label>
          收藏名称
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <button
          disabled={name.trim() === "" || !workspace.connection.writableStore}
          onClick={() => {
            const slot = records?.add("query", { ...workspace.editorData(), name: name.trim() });
            slot?.schedule();
            setName("");
          }}
        >
          收藏当前输入
        </button>
      </div>
      <QueryItems
        workspace={workspace}
        slots={queries.slice(start, start + 50)}
        onRemove={setRemoved}
      />
      <div className="actions">
        <button
          disabled={page === 0}
          onClick={() => {
            setPage(page - 1);
          }}
        >
          上一组收藏
        </button>
        <button
          disabled={start + 50 >= queries.length}
          onClick={() => {
            setPage(page + 1);
          }}
        >
          下一组收藏
        </button>
      </div>
      {records?.cursors.has("query") === true && (
        <button
          onClick={() => {
            void records.load("query", true).then(() => {
              setPage(Math.floor(queries.length / 50));
            });
          }}
        >
          加载更多收藏
        </button>
      )}
      {removed !== undefined && (
        <DeleteQuery
          slot={removed}
          onClose={() => {
            setRemoved(undefined);
          }}
        />
      )}
    </details>
  );
}

function DeleteQuery({ slot, onClose }: { slot: RecordSlot; onClose: () => void }) {
  return (
    <>
      {
        <Modal
          title="删除一份收藏查询"
          onClose={() => {
            onClose();
          }}
        >
          <p>
            仅删除 query：{textField(slot.data, "name", "未命名查询")}。此操作不改变知识或草稿。
          </p>
          <p>{slot.error}</p>
          <button
            onClick={() => {
              void slot.flush().then(async (saved) => {
                if (saved && (await slot.delete())) onClose();
              });
            }}
          >
            确认删除
          </button>
        </Modal>
      }
    </>
  );
}

function QueryItems({
  workspace,
  slots,
  onRemove
}: {
  workspace: Workspace;
  slots: RecordSlot[];
  onRemove: (slot: RecordSlot) => void;
}) {
  return (
    <ul>
      {slots.map((slot) => (
        <li key={slot.id}>
          <strong>{textField(slot.data, "name", "未命名查询")}</strong>
          <span className="muted"> · {slot.status}</span>
          <div className="actions">
            <button
              onClick={() => {
                workspace.edit(
                  textField(slot.data, "statement"),
                  textField(slot.data, "paramsText", "{}"),
                  slot.data["mode"] === "execute" ? "execute" : "query"
                );
              }}
            >
              填入编辑器
            </button>
            <button
              onClick={() => {
                onRemove(slot);
              }}
            >
              删除收藏
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
