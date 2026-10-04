import { useState } from "react";
import { type JsonValue } from "@kgos/sdk";

export function ValueView({
  value,
  label = "原始值",
  source
}: {
  value: JsonValue;
  label?: string;
  source?: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = source ?? JSON.stringify(value, null, 2);
  return (
    <div className="value-view">
      <pre>{expanded ? text : text.slice(0, 320)}</pre>
      {text.length > 320 && (
        <button
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded ? "收起" : `展开${label}`}
        </button>
      )}
    </div>
  );
}

export function RowsView({ rows, sources }: { rows: JsonValue[][]; sources?: string[] }) {
  const [page, setPage] = useState(0);
  const start = Math.min(page * 20, Math.max(0, rows.length - 1));
  return (
    <section className="rows-view" aria-label="原始 JSON 结果">
      <p>
        已接收 {rows.length} 行 · 显示 {rows.length === 0 ? 0 : start + 1}–
        {Math.min(start + 20, rows.length)}
      </p>
      {rows.slice(start, start + 20).map((row, index) => (
        <ValueView
          key={start + index}
          value={row}
          source={sources?.[start + index]}
          label={`第 ${String(start + index + 1)} 行`}
        />
      ))}
      <div className="actions">
        <button
          disabled={page === 0}
          onClick={() => {
            setPage(page - 1);
          }}
        >
          上一片段
        </button>
        <button
          disabled={start + 20 >= rows.length}
          onClick={() => {
            setPage(page + 1);
          }}
        >
          下一片段
        </button>
      </div>
    </section>
  );
}
