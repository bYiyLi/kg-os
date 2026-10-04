import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { type Context } from "./context.js";
import { Modal } from "./dialog.js";
import { type Frame } from "./frame.js";
import { frameStatus, selectedProperties, type FrameEngine } from "./frame-engine.js";
import { GraphView } from "./graph-view.js";
import { shorten } from "./json.js";
import { elementTitle, type GraphElement } from "./projection.js";
import { RowsView, ValueView } from "./value-view.js";

export interface FrameViewProps {
  frame: Frame;
  engine: FrameEngine;
  context: Context;
  onCopy: (frame: Frame) => void;
  onEdit: (ref?: string, state?: string) => void;
}

function Inspector(propsForSelection: FrameViewProps) {
  const { frame, engine } = propsForSelection;
  const projection = frame.projection;
  const selected = [...projection.nodes, ...projection.relationships].find(
    (item) => item.ref === frame.selected
  );
  const [page, setPage] = useState(0);
  const nodes = projection.nodes.slice(page * 20, page * 20 + 20);
  return (
    <aside className="inspector" aria-label="当前帧检查器">
      <h3>{selected === undefined ? "当前帧子图" : elementTitle(selected)}</h3>
      <p className="muted">
        {projection.nodes.length} 节点 · {projection.relationships.length} 关系 ·{" "}
        {frame.expandedRows.length} 展开行
      </p>
      <p className="state-ref" title={frame.state}>
        State {shorten(frame.state)}
      </p>
      {selected !== undefined && <SelectedDetails {...propsForSelection} selected={selected} />}
      {selected === undefined && (
        <p>
          {[...new Set(projection.nodes.flatMap((node) => node.labels))]
            .map(
              (label) =>
                `${label} ${String(projection.nodes.filter((node) => node.labels.includes(label)).length)}`
            )
            .join(" · ") || "无 Label 分布"}
          <br />
          {[...new Set(projection.relationships.map((edge) => edge.type))].join(" · ")}
        </p>
      )}
      <details>
        <summary>键盘对象导航</summary>
        <div className="object-list">
          {nodes.map((node) => (
            <button
              key={node.ref}
              onClick={() => {
                frame.select(node.ref, engine.connection);
              }}
            >
              {node.ref} · {elementTitle(node)}
            </button>
          ))}
        </div>
        <button
          disabled={page === 0}
          onClick={() => {
            setPage(page - 1);
          }}
        >
          上一组对象
        </button>
        <button
          disabled={(page + 1) * 20 >= projection.nodes.length}
          onClick={() => {
            setPage(page + 1);
          }}
        >
          下一组对象
        </button>
      </details>
    </aside>
  );
}

function FrameContent(props: FrameViewProps) {
  const { frame, engine } = props;
  return (
    <>
      <nav className="tabs" aria-label="结果展示">
        <button
          aria-pressed={frame.view === "graph"}
          onClick={() => {
            frame.view = "graph";
            frame.persist();
          }}
        >
          图谱
        </button>
        <button
          aria-pressed={frame.view === "json"}
          onClick={() => {
            frame.view = "json";
            frame.persist();
          }}
        >
          JSON / 行
        </button>
      </nav>
      {frame.evicted && (
        <p className="notice">
          结果数据未载入，原计数 {frame.rowCount} 行。
          <button
            onClick={() => {
              void engine.loadCache(frame);
            }}
          >
            加载完整缓存
          </button>
        </p>
      )}
      {frame.view === "graph" ? (
        <div className="frame-body">
          <GraphView frame={frame} connection={engine.connection} />
          <Inspector {...props} />
        </div>
      ) : (
        <RowsView rows={frame.rows} sources={frame.rowSources} />
      )}
      {frame.request.mode === "execute" && (
        <div className="execute-summary">
          <p>
            结果 State：<code>{frame.resultState || "未确认"}</code>
          </p>
          {frame.counters !== undefined && <ValueView value={frame.counters} label="执行计数" />}
          <button
            disabled={frame.resultState === ""}
            onClick={() => {
              engine.explore(frame);
            }}
          >
            在结果 State 新建只读帧
          </button>
        </div>
      )}
    </>
  );
}

export function FrameView(props: FrameViewProps) {
  const { frame } = props;
  useSyncExternalStore(frame.subscribe, frame.snapshot);
  const [fullscreen, setFullscreen] = useState(false);
  const element = useRef<HTMLElement>(null);
  const previousFullscreen = useRef(false);
  useEffect(() => {
    if (previousFullscreen.current && !fullscreen) {
      const trigger = Array.from(element.current?.querySelectorAll("button") ?? []).find(
        (button) => button.textContent === "全屏"
      );
      trigger?.focus();
    }
    previousFullscreen.current = fullscreen;
  }, [fullscreen]);
  useEffect(() => {
    if (element.current === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        frame.visible = entry?.isIntersecting ?? true;
      },
      { rootMargin: "200px" }
    );
    observer.observe(element.current);
    return () => {
      observer.disconnect();
    };
  }, [frame]);
  const header = <FrameHeader {...props} fullscreen={fullscreen} setFullscreen={setFullscreen} />;
  if (frame.closed) return null;
  return (
    <section className="query-frame" ref={element} aria-label={`结果帧 ${shorten(frame.state)}`}>
      {fullscreen ? (
        <Modal
          title="结果帧全屏"
          onClose={() => {
            setFullscreen(false);
          }}
          className="fullscreen-frame"
        >
          {header}
          <FrameContent {...props} />
        </Modal>
      ) : (
        <>
          {header}
          {!frame.collapsed && <FrameContent {...props} />}
        </>
      )}
    </section>
  );
}

function SelectedDetails({
  frame,
  engine,
  onEdit,
  selected
}: FrameViewProps & { selected: GraphElement }) {
  const properties = selectedProperties(frame);
  return (
    <>
      {
        <>
          <p>
            <strong>Ref</strong> <code>{selected.ref}</code>
          </p>
          {selected.kind === "node" ? (
            <p>
              Labels：{selected.labels.join(", ") || (selected.loaded ? "无 Label" : "端点未加载")}
            </p>
          ) : (
            <p>
              Type：{selected.type}
              <br />
              {selected.start} → {selected.end}
            </p>
          )}
          {properties !== undefined && (
            <ValueView value={properties} source={frame.detailSource} label="属性" />
          )}
          {frame.detailError && (
            <p className="warning">公共 Object 不可读取：{frame.detailError}</p>
          )}
          {frame.request.mode === "query" && (
            <div className="actions">
              {selected.kind === "node" && (
                <button
                  disabled={frame.neighborLoading}
                  onClick={() => {
                    void engine.neighbors(frame);
                  }}
                >
                  扩展邻居（最多 50 行）
                </button>
              )}
              <button
                disabled={frame.detail === undefined}
                onClick={() => {
                  onEdit(selected.ref, frame.state);
                }}
              >
                编辑对象
              </button>
            </div>
          )}
          {frame.neighborLoading && (
            <button
              onClick={() => {
                frame.neighborController?.abort();
                frame.neighborLoading = false;
                frame.changed();
              }}
            >
              取消展开
            </button>
          )}
          {frame.neighborError && <p role="alert">{frame.neighborError}</p>}
        </>
      }
    </>
  );
}

function FrameHeader(
  props: FrameViewProps & { fullscreen: boolean; setFullscreen: (open: boolean) => void }
) {
  const { frame } = props;
  const header = (
    <>
      <header className="frame-header">
        <div>
          <h2>{frame.request.mode === "query" ? "知识查询结果" : "高级执行结果"}</h2>
          <span className="badge" title={frame.state || frame.request.branch}>
            {" "}
            {frame.request.mode === "query"
              ? shorten(frame.state)
              : `Branch ${frame.request.branch ?? ""}`}
          </span>
        </div>
        <FrameActions {...props} />
      </header>
      <pre className="frame-statement">{frame.request.statement}</pre>
      <details>
        <summary>参数与请求上下文</summary>
        {frame.request.paramsText === undefined ? (
          <ValueView value={frame.request.params} label="参数" />
        ) : (
          <pre aria-label="参数">{frame.request.paramsText}</pre>
        )}
        <code>{frame.request.readState ?? frame.request.observedHead}</code>
      </details>
      <p className="frame-status" role="status">
        {frameStatus(frame)} · {frame.rowCount} 行 · 客户端耗时 {Math.round(frame.elapsed)} ms{" "}
        {frame.slot !== undefined && `· ${frame.slot.status}`}
      </p>
      {frame.error && (
        <p className="warning" role="alert">
          {frame.error}
        </p>
      )}
    </>
  );
  return header;
}

function FrameActions({
  frame,
  engine,
  context,
  onCopy,
  fullscreen,
  setFullscreen
}: FrameViewProps & { fullscreen: boolean; setFullscreen: (open: boolean) => void }) {
  const original = () => {
    if (frame.request.mode === "query") engine.run(frame.request);
    else onCopy(frame);
  };
  return (
    <div className="actions">
      <button onClick={original}>
        {frame.request.mode === "query" ? "按原 State 重跑" : "复制并再次执行"}
      </button>
      <button
        onClick={() => {
          onCopy(frame);
        }}
      >
        复制到新查询
      </button>
      {frame.request.mode === "query" && (
        <button
          disabled={!context.runnable}
          onClick={() =>
            engine.run({
              ...frame.request,
              readState: context.state,
              inputRef: context.inputRef
            })
          }
        >
          按当前 State 新跑
        </button>
      )}
      {frame.active && (
        <button
          onClick={() => {
            frame.cancel();
          }}
        >
          取消
        </button>
      )}
      <button
        onClick={() => {
          frame.collapsed = !frame.collapsed;
          frame.persist();
        }}
      >
        {frame.collapsed ? "展开" : "折叠"}
      </button>
      <button
        onClick={() => {
          setFullscreen(!fullscreen);
        }}
      >
        {fullscreen ? "返回工作区" : "全屏"}
      </button>
      <button
        onClick={() => {
          frame.cancel(true);
          setFullscreen(false);
        }}
      >
        {frame.active ? "取消并关闭" : "关闭"}
      </button>
    </div>
  );
}
