import { PRODUCT_NAME } from "@kgos/sdk";

export function Shell() {
  return (
    <section className="shell" aria-labelledby="page-title">
      <p className="eyebrow">Phase 00 development environment</p>
      <h1 id="page-title">{PRODUCT_NAME}</h1>
      <p className="summary">Go 宿主、构建和浏览器链路已经接通。</p>
      <div className="status" role="status">
        <span className="status-dot" aria-hidden="true" />
        <span>Development shell ready</span>
      </div>
      <p className="boundary">
        Knowledge Base、认证和业务 API 尚未实现；本页面不会伪造业务成功状态。
      </p>
    </section>
  );
}
