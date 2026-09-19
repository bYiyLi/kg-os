import { PRODUCT_NAME } from "@kgos/sdk";

export interface ShellMount {
  innerHTML: string;
}

export function mountShell(app: ShellMount | null): void {
  if (app === null) {
    throw new Error("Missing #app mount point");
  }

  app.innerHTML = `
  <section class="shell" aria-labelledby="page-title">
    <p class="eyebrow">Phase 0 development environment</p>
    <h1 id="page-title">${PRODUCT_NAME}</h1>
    <p class="summary">开发宿主、构建和浏览器链路已经接通。</p>
    <div class="status" role="status">
      <span class="status-dot" aria-hidden="true"></span>
      <span>Development shell ready</span>
    </div>
    <p class="boundary">Knowledge Base、认证和业务 API 尚未实现；本页面不会伪造业务成功状态。</p>
  </section>
`;
}
