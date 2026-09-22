import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Shell } from "./shell.js";

describe("Shell", () => {
  it("renders the Phase 01 runtime boundary", () => {
    const markup = renderToStaticMarkup(<Shell />);

    expect(markup).toContain("KG OS");
    expect(markup).toContain("Runtime shell ready");
    expect(markup).toContain("业务 API 尚未实现");
    expect(markup).toContain("Lithograph Host");
  });
});
