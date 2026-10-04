import { useEffect, useState, useSyncExternalStore } from "react";
import { type ObjectKind } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { type Context } from "./context.js";
import { ObjectDraftList, ObjectEditorModal } from "./edit-workspace.js";
import { type Records, type RecordSlot } from "./records.js";
import { OntologyBrowser } from "./ontology-controller.js";
import { OntologyGraph } from "./ontology-graph.js";
import { OntologyInspector } from "./ontology-inspector.js";
import { ValueView } from "./value-view.js";

export interface OntologyWorkspaceProps {
  connection: Connection;
  context: Context;
  records: Records | undefined;
  onCommitted?: (() => void) | undefined;
}
interface Editing {
  ref: string | undefined;
  kind?: ObjectKind;
  slot?: RecordSlot;
}

function OntologyToolbar({
  browser,
  onCreate
}: {
  browser: OntologyBrowser;
  onCreate: (kind: ObjectKind) => void;
}) {
  const [ref, setRef] = useState("");
  return (
    <header className="ontology-toolbar">
      <div className="section-header">
        <h2>{browser.scope === undefined ? "全部本体" : `领域 · ${browser.scope}`}</h2>
        <div className="actions">
          <button
            disabled={browser.loading}
            onClick={() => {
              void browser.navigate(undefined);
            }}
          >
            全部本体
          </button>
          <button
            disabled={!browser.context.editable}
            onClick={() => {
              onCreate("node-definition");
            }}
          >
            新建节点定义
          </button>
          <button
            disabled={!browser.context.editable}
            onClick={() => {
              onCreate("relationship-definition");
            }}
          >
            新建关系定义
          </button>
          <button
            className="primary"
            disabled={!browser.context.editable}
            onClick={() => {
              onCreate("domain");
            }}
          >
            新建领域
          </button>
        </div>
      </div>
      <p>定义描述知识实例，领域组织模型；当前只展示明确已加载的范围。</p>
      <div className="actions">
        <label htmlFor="ontology-known-ref">已知 Definition / Domain Ref</label>
        <input
          id="ontology-known-ref"
          value={ref}
          onChange={(event) => {
            setRef(event.target.value);
          }}
          placeholder="node: / relationship: / domain:"
        />
        <button
          disabled={ref === "" || browser.loading || browser.connection.client === undefined}
          onClick={() => {
            if (ref.startsWith("domain:")) void browser.navigate(ref);
            else void browser.inspect(ref);
          }}
        >
          读取准确 Ref
        </button>
      </div>
    </header>
  );
}

function PageRange({ browser }: { browser: OntologyBrowser }) {
  const page = browser.page;
  if (page === undefined) return null;
  return (
    <div className="ontology-range">
      <p>
        {browser.scope === undefined ? "全局入口" : "领域直接成员"} · 已加载 {page.items.length}/
        {page.total}
        {page.cursor !== undefined ? " · 还有未加载范围" : " · 当前范围已读完"}
      </p>
      {page.cursor !== undefined && (
        <button
          disabled={browser.loading}
          onClick={() => {
            void browser.more();
          }}
        >
          读取下一页
        </button>
      )}
      {page.items.length === 0 && browser.error === "" && (
        <p>
          {browser.scope === undefined ? "当前 State 没有可发现的本体。" : "该领域没有直接成员。"}
        </p>
      )}
    </div>
  );
}

export function OntologyWorkspace(props: OntologyWorkspaceProps) {
  const [browser] = useState(() => new OntologyBrowser(props.connection, props.context));
  const [editing, setEditing] = useState<Editing | undefined>();
  useSyncExternalStore(browser.subscribe, browser.snapshot);
  useSyncExternalStore(props.context.subscribe, props.context.snapshot);
  useSyncExternalStore(props.connection.subscribe, props.connection.snapshot);
  useEffect(() => {
    void browser.reload();
    return () => {
      browser.dispose();
    };
  }, [browser, props.context.state, props.connection.client]);
  return (
    <section className="ontology-workspace" aria-label="本体图谱">
      <OntologyToolbar
        browser={browser}
        onCreate={(kind) => {
          setEditing({ ref: undefined, kind });
        }}
      />
      <p className="state-line">
        State <code>{browser.state || "尚未选择"}</code>
      </p>
      {browser.loading && <p role="status">正在读取同 State 本体范围…</p>}
      {browser.error !== "" && (
        <p role="alert" className="error">
          {browser.error}
        </p>
      )}
      {browser.consistency !== undefined && (
        <details open>
          <summary>State consistency 诊断</summary>
          <ValueView value={browser.consistency} />
        </details>
      )}
      <PageRange browser={browser} />
      <div className="ontology-layout">
        <OntologyGraph browser={browser} />
        <OntologyInspector
          browser={browser}
          onEdit={(ref) => {
            setEditing({ ref });
          }}
        />
      </div>
      <ObjectDraftList
        records={props.records}
        onOpen={(slot) => {
          setEditing({ ref: undefined, slot });
        }}
      />
      {editing !== undefined && (
        <ObjectEditorModal
          key={editing.slot?.id ?? `${editing.ref ?? "new"}-${editing.kind ?? "existing"}`}
          {...props}
          ref={editing.ref}
          initialKind={editing.kind}
          slot={editing.slot}
          onClose={() => {
            setEditing(undefined);
          }}
        />
      )}
    </section>
  );
}
