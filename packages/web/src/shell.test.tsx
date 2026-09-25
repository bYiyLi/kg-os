import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Shell } from "./shell.js";

describe("Shell", () => {
  it("renders the current local Runtime boundary", () => {
    const markup = renderToStaticMarkup(<Shell />);

    expect(markup).toContain("KG OS");
    expect(markup).toContain("Runtime shell ready");
    expect(markup).toContain("API 已由 daemon 提供");
    expect(markup).toContain("Lithograph Host");
    expect(markup).toContain("Instance Root");
  });
});
