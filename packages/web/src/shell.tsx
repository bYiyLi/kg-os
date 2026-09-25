import { PRODUCT_NAME } from "@kgos/sdk";

export function Shell() {
  return (
    <section className="shell" aria-labelledby="page-title">
      <p className="eyebrow">KG OS local runtime</p>
      <h1 id="page-title">{PRODUCT_NAME}</h1>
      <p className="summary">
        Explicit Instance Root、Lithograph Host 与内置 Web 共用当前 kgosd endpoint。
      </p>
      <div className="status" role="status">
        <span className="status-dot" aria-hidden="true" />
        <span>Runtime shell ready</span>
      </div>
      <p className="boundary">
        Ontology、Object、Graph、Evolution API 已由 daemon 提供；当前 Web
        仍是管理界面壳层，不伪造业务状态。
      </p>
    </section>
  );
}
