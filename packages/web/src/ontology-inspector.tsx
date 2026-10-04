import { type JsonObject, type JsonValue } from "@kgos/sdk";

import { isObject } from "./json.js";
import { KIND_LABELS } from "./edit-patch.js";
import { type OntologyBrowser } from "./ontology-controller.js";
import { ValueView } from "./value-view.js";

function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function entries(value: JsonValue | undefined): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function text(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function RulesRead({ value, owner, field }: { value: JsonObject; owner: string; field?: string }) {
  const constraints = entries(value["constraints"]);
  const indexes = entries(value["indexes"]);
  return (
    <>
      {constraints.length > 0 && (
        <section>
          <h4>具名 Constraint · {constraints.length}</h4>
          <ul>
            {constraints.map((rule, index) => (
              <li key={index}>
                {text(rule["name"], "未提供名称")} · {text(rule["type"])} · 有序字段{" "}
                {field ?? strings(rule["properties"]).join(" → ")}
              </li>
            ))}
          </ul>
        </section>
      )}
      {indexes.length > 0 && (
        <section>
          <h4>实际 Index · {indexes.length}</h4>
          {indexes.map((index, item) => (
            <div className="ontology-index" key={item}>
              <strong>{text(index["name"])}</strong> ·{" "}
              {index["type"] === "vector" ? "托管语义 (vector)" : text(index["type"])}
              <p>字段：{field ?? strings(index["properties"]).join(" → ")} · 顺序保留</p>
              <p>
                全部 targets：
                {index["targets"] === undefined ? owner : strings(index["targets"]).join("、")}
              </p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function PropertiesRead({ value, owner }: { value: JsonObject; owner: string }) {
  const properties = entries(value["properties"]);
  return (
    <section className="ontology-properties">
      <h4>字段 · {properties.length}</h4>
      <p>声明字段不会默认设为实例必填；required、unique、key 与独立索引分别表达。</p>
      {properties.map((property, index) => (
        <section className="ontology-property" key={index}>
          <strong>{text(property["name"])}</strong> · <code>{text(property["type"])}</code>
          {property["required"] === true && <span className="badge">required</span>}
          {property["unique"] === true && <span className="badge">unique</span>}
          <p>{text(property["description"], "未提供说明")}</p>
          <RulesRead value={property} owner={owner} field={text(property["name"])} />
        </section>
      ))}
    </section>
  );
}

function EndpointRead({
  browser,
  value,
  label
}: {
  browser: OntologyBrowser;
  value: JsonValue | undefined;
  label: string;
}) {
  return (
    <div className="field-row">
      <strong>{label}</strong>
      {value === null ? (
        <span>此端不限制类型（null）</span>
      ) : (
        <button
          disabled={typeof value !== "string"}
          onClick={() => {
            if (typeof value === "string") void browser.inspect(value);
          }}
        >
          {text(value, "未加载或无法解释的端点")}
        </button>
      )}
    </div>
  );
}

function OrganizationRead({ browser, value }: { browser: OntologyBrowser; value: JsonObject }) {
  return (
    <section>
      <h4>直接成员 · {strings(value["includes"]).length}</h4>
      <ul>
        {strings(value["includes"]).map((ref) => (
          <li key={ref}>
            <button
              onClick={() => {
                if (ref.startsWith("domain:")) void browser.navigate(ref);
                else void browser.inspect(ref);
              }}
            >
              {ref}
            </button>
          </li>
        ))}
      </ul>
      <p>领域允许多父与循环，只组织模型；不隔离端点，不表示权限或 namespace。</p>
    </section>
  );
}

function KnownReferences({ browser }: { browser: OntologyBrowser }) {
  const selected = browser.selected;
  const relations = [...browser.summaries().values()].filter(
    (item) =>
      item.kind === "relationship-definition" && (item.from === selected || item.to === selected)
  );
  const parents = [...browser.pages.values()].filter(
    (page) => page.ref !== undefined && page.items.some((item) => item.ref === selected)
  );
  return (
    <details>
      <summary>已加载范围内的引用与组织</summary>
      <p>
        端点引用：
        {relations.length === 0
          ? "已加载范围内未发现"
          : relations.map((item) => item.ref).join("、")}
      </p>
      <p>
        父领域：
        {parents.length === 0 ? "已加载范围内未发现" : parents.map((page) => page.ref).join("、")}
      </p>
      <small>未展开、未翻页范围仍未知；这里不提供全库依赖计数。</small>
    </details>
  );
}

export function OntologyInspector({
  browser,
  onEdit
}: {
  browser: OntologyBrowser;
  onEdit: (ref: string) => void;
}) {
  const detail = browser.detail;
  if (browser.inspecting)
    return (
      <aside className="ontology-inspector" role="status">
        正在读取同 State 完整聚合…
      </aside>
    );
  if (browser.detailError !== "")
    return (
      <aside className="ontology-inspector" role="alert">
        {browser.detailError}
      </aside>
    );
  if (detail === undefined)
    return (
      <aside className="ontology-inspector">
        <p>选择领域或 Definition 查看同 State 的完整 aggregate。</p>
      </aside>
    );
  if (!isObject(detail.value))
    return <aside role="alert">该 aggregate 无法无损解释；禁止以截断表单编辑。</aside>;
  const value = detail.value;
  const title = text(value["title"], text(value["name"], detail.ref));
  return (
    <aside className="ontology-inspector" aria-label="本体聚合详情">
      <header className="section-header">
        <h3>
          {KIND_LABELS[detail.kind]} · {title}
        </h3>
        <button
          disabled={!browser.context.editable || browser.state !== browser.context.state}
          onClick={() => {
            onEdit(detail.ref);
          }}
        >
          编辑聚合
        </button>
      </header>
      <code>{detail.ref}</code>
      <p>{text(value["description"], "未提供说明")}</p>
      {detail.kind === "domain" ? (
        <>
          <button
            disabled={browser.loading}
            onClick={() => {
              void browser.navigate(detail.ref);
            }}
          >
            打开领域直接成员
          </button>
          <OrganizationRead browser={browser} value={value} />
        </>
      ) : (
        <>
          {detail.kind === "node-definition" && (
            <p>附加必需 Labels：{strings(value["labels"]).join("、") || "无"}</p>
          )}
          {detail.kind === "relationship-definition" && (
            <>
              <EndpointRead browser={browser} value={value["from"]} label="from · 类型约束" />
              <EndpointRead browser={browser} value={value["to"]} label="to · 类型约束" />
            </>
          )}
          <PropertiesRead value={value} owner={detail.ref} />
          <RulesRead value={value} owner={detail.ref} />
        </>
      )}
      <KnownReferences browser={browser} />
      <details>
        <summary>原始 aggregate JSON</summary>
        <ValueView value={value} />
      </details>
      <details
        onToggle={(event) => {
          if (event.currentTarget.open && browser.canonical === "") void browser.readCanonical();
        }}
      >
        <summary>同 State canonical YAML</summary>
        <pre>{browser.canonical || "正在读取…"}</pre>
      </details>
    </aside>
  );
}
