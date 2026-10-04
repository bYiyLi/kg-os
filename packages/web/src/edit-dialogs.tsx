import { Modal } from "./dialog.js";
import { type ObjectDraft } from "./edit-controller.js";

interface ChoiceProps {
  draft: ObjectDraft;
  onClose: () => void;
  onCancel: () => void;
}

export function LeaveDialog({ draft, onClose, onCancel }: ChoiceProps) {
  return (
    <Modal title="尚未确认保存的输入" onClose={onCancel}>
      <p>本窗口输入尚未获得保存确认，关闭后可能丢失。</p>
      <div className="actions">
        <button onClick={onCancel}>继续编辑</button>
        <button
          onClick={() => {
            void draft.save().then((saved) => {
              if (saved) onClose();
            });
          }}
        >
          保存后关闭
        </button>
        <button className="danger" onClick={onClose}>
          关闭并保留已保存版本
        </button>
      </div>
    </Modal>
  );
}

export function DiscardDialog({ draft, onClose, onCancel }: ChoiceProps) {
  return (
    <Modal title="放弃对象草稿" onClose={onCancel}>
      <p>仅删除本条前端草稿记录，不修改 Knowledge State。</p>
      <div className="actions">
        <button onClick={onCancel}>继续保留草稿</button>
        <button
          className="danger"
          onClick={() => {
            void draft.discard().then((deleted) => {
              if (deleted) onClose();
            });
          }}
        >
          确认放弃草稿
        </button>
      </div>
    </Modal>
  );
}
