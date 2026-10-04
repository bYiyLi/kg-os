import { useState } from "react";

import { Modal } from "./dialog.js";
import { type RecordSlot, type Records } from "./records.js";

export function Recovery({ records }: { records: Records | undefined }) {
  const [selected, setSelected] = useState<RecordSlot>();
  const slots =
    records?.slots.filter((slot) => slot.status === "内容冲突" || slot.status === "结果待核对") ??
    [];
  if (slots.length === 0) return null;
  return (
    <div className="recovery notice" role="status">
      <span>{slots.length} 份输入需要核对保存版本</span>
      <button
        onClick={() => {
          setSelected(slots[0]);
        }}
      >
        查看对照
      </button>
      {selected !== undefined && (
        <Modal
          title="保存版本对照"
          onClose={() => {
            setSelected(undefined);
          }}
        >
          <p>
            {selected.kind} · {selected.status}
          </p>
          <p>{selected.error}</p>
          <div className="comparison">
            <section>
              <h3>本窗口输入</h3>
              <pre>{JSON.stringify(selected.data, null, 2)}</pre>
            </section>
            <section>
              <h3>最新保存版本</h3>
              <pre>
                {selected.remote?.deleted === true
                  ? "已删除"
                  : JSON.stringify(selected.remote?.data ?? null, null, 2)}
              </pre>
            </section>
          </div>
          <div className="actions">
            <button
              onClick={() => {
                void selected
                  .readRemote()
                  .then((record) => {
                    selected.remote = record;
                    selected.changed();
                  })
                  .catch((error: unknown) => {
                    selected.error = selected.connection.failure(error);
                    selected.changed();
                  });
              }}
            >
              重新核对
            </button>
            <button
              disabled={selected.remote?.data == null}
              onClick={() => {
                selected.useRemote();
                setSelected(undefined);
              }}
            >
              显式采用保存版本
            </button>
            <button
              onClick={() => {
                void selected.saveCopy().then((saved) => {
                  if (saved) setSelected(undefined);
                });
              }}
            >
              另存本窗口副本
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
