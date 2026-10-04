import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { type Connection } from "./connection.js";
import { type Context } from "./context.js";
import { Modal } from "./dialog.js";
import { MergeController } from "./merge-controller.js";
import { MergeWorkspace } from "./merge-workspace.js";
import { type Records } from "./records.js";
import { ChangesWorkspace } from "./version-change-view.js";
import { VersionHistory } from "./version-history.js";
import {
  useVersionLocation,
  versionTitles as titles,
  type VersionView as View
} from "./version-location.js";
import { RefsWorkspace } from "./version-ref-view.js";
import { VersionRefs } from "./version-refs.js";
import { StateWorkspace } from "./version-state-view.js";
import { VersionTimeline } from "./version-timeline.js";

function VersionTaskView({
  view,
  connection,
  context,
  records,
  state,
  history,
  refs,
  merge,
  onDetails,
  filter
}: {
  view: View;
  connection: Connection;
  context: Context;
  records: Records | undefined;
  state: string;
  history: VersionHistory;
  refs: VersionRefs;
  merge: MergeController;
  onDetails: (state: string) => void;
  filter: string;
}) {
  switch (view) {
    case "dag":
      return (
        <VersionTimeline
          history={history}
          context={context}
          expanded
          filter={filter}
          onDetails={onDetails}
          records={records}
        />
      );
    case "state":
      return (
        <StateWorkspace connection={connection} context={context} state={state} records={records} />
      );
    case "refs":
      return <RefsWorkspace model={refs} context={context} />;
    case "merge":
      return <MergeWorkspace model={merge} context={context} />;
    case "diff":
    case "history":
      return (
        <ChangesWorkspace
          connection={connection}
          state={state}
          states={history.items.map((item) => item.state)}
          mode={view}
        />
      );
  }
}

export function VersionPanel({
  connection,
  context,
  records
}: {
  connection: Connection;
  context: Context;
  records: Records | undefined;
}) {
  const history = useMemo(() => new VersionHistory(connection), [connection]);
  const refs = useMemo(() => new VersionRefs(context), [context]);
  const merge = useMemo(
    () => new MergeController(connection, context, records),
    [connection, context, records]
  );
  useSyncExternalStore(context.subscribe, context.snapshot);
  useSyncExternalStore(connection.subscribe, connection.snapshot);
  useSyncExternalStore(history.subscribe, history.snapshot);
  const { view, state: detailState, open } = useVersionLocation(records, context);
  const [filter, setFilter] = useState("");
  const openDetails = (state: string) => {
    open("state", state);
  };
  useVersionRoot(history, context, records);
  return (
    <aside className="version-panel" aria-label="知识版本">
      <header className="version-panel-header">
        <h2>知识版本</h2>
        <button
          disabled={!context.runnable}
          onClick={() => {
            open("dag", context.state);
          }}
        >
          展开 DAG
        </button>
      </header>
      <label>
        已加载历史内搜索
        <input
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
          }}
        />
      </label>
      <VersionTimeline
        history={history}
        context={context}
        filter={filter}
        onDetails={openDetails}
        records={records}
      />
      <VersionLocator connection={connection} context={context} history={history} />
      <VersionActions
        context={context}
        onOpen={(next) => {
          open(next, context.state);
        }}
      />
      {view !== undefined && (
        <VersionDialog
          key={view}
          view={view}
          filter={filter}
          setFilter={setFilter}
          onClose={() => {
            open(undefined);
          }}
        >
          <VersionTaskView
            view={view}
            connection={connection}
            context={context}
            records={records}
            state={detailState || context.state}
            history={history}
            refs={refs}
            merge={merge}
            onDetails={openDetails}
            filter={filter}
          />
        </VersionDialog>
      )}
    </aside>
  );
}

function useVersionRoot(history: VersionHistory, context: Context, records: Records | undefined) {
  useEffect(() => {
    if (context.runnable && history.root === "") {
      const root = records?.slots.find((slot) => slot.kind === "workspace")?.data["versionRoot"];
      void history.open(typeof root === "string" && root !== "" ? root : context.state);
    }
  }, [context, context.state, context.runnable, history, records]);
}

function VersionDialog({
  view,
  filter,
  setFilter,
  onClose,
  children
}: {
  view: View;
  filter: string;
  setFilter: (filter: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      title={titles[view]}
      className={view === "dag" ? "version-dag-dialog" : "version-task-dialog"}
      onClose={onClose}
    >
      {view === "dag" && (
        <label>
          已加载历史内搜索
          <input
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
        </label>
      )}
      {children}
    </Modal>
  );
}

function VersionLocator({
  connection,
  context,
  history
}: {
  connection: Connection;
  context: Context;
  history: VersionHistory;
}) {
  const [direct, setDirect] = useState("");
  return (
    <>
      <details>
        <summary>完整 StateRef 定位 / root</summary>
        <label>
          StateRef
          <input
            value={direct}
            onChange={(event) => {
              setDirect(event.target.value);
            }}
            placeholder="commit/… / branch/… / tag/…"
          />
        </label>
        <button
          disabled={direct === "" || connection.client === undefined}
          onClick={() => {
            void context.select(direct);
          }}
        >
          定位 StateRef
        </button>
        <button
          disabled={!context.runnable || history.busy}
          onClick={() => {
            void history.open(context.state);
          }}
        >
          以当前浏览 State 加载 ancestry
        </button>
        <p>
          当前 ancestry root <code>{history.resolvedRoot || history.root}</code>
        </p>
      </details>
      {context.headChanged && (
        <button
          disabled={!context.runnable}
          onClick={() => {
            const root = context.observedTarget;
            if (root !== undefined) void history.open(root);
          }}
        >
          加载新 head 的 ancestry
        </button>
      )}
    </>
  );
}

function VersionActions({ context, onOpen }: { context: Context; onOpen: (view: View) => void }) {
  return (
    <nav className="version-actions" aria-label="版本操作">
      {(["state", "history", "diff", "refs", "merge"] as const).map((next) => (
        <button
          key={next}
          disabled={!context.runnable}
          onClick={() => {
            onOpen(next);
          }}
        >
          {titles[next]}
        </button>
      ))}
    </nav>
  );
}
