import { PRODUCT_NAME } from "@kgos/sdk";

export function Shell() {
  return (
    <section className="shell" aria-labelledby="page-title">
      <p className="eyebrow">Phase 01 runtime foundation</p>
      <h1 id="page-title">{PRODUCT_NAME}</h1>
      <p className="summary">KG_HOME、Lithograph Host 与内置 Web 已接入真实 Runtime。</p>
      <div className="status" role="status">
        <span className="status-dot" aria-hidden="true" />
        <span>Runtime shell ready</span>
      </div>
      <p className="boundary">
        Ontology、Object、Graph、Evolution 的公共业务 API 尚未实现；本页面不会伪造业务成功状态。
      </p>
    </section>
  );
}
