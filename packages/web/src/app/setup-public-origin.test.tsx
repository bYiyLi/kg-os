// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { expect, it, vi } from "vitest";

import { SetupPublicOrigin } from "../features/setup/setup-public-origin.js";
import { i18n } from "./i18n/index.js";

it("distinguishes invalid origins, loopback warnings and remote MCP endpoints", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();

  function render(value: string) {
    act(() => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SetupPublicOrigin value={value} mcpPath="/mcp" onChange={onChange} />
        </I18nextProvider>
      );
    });
  }

  try {
    render("https://kgos.example.com/invalid-path");
    expect(host.querySelector("#setup-public-origin")?.getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector(".setup-public-preview")).toBeNull();
    expect(host.querySelector(".setup-public-guidance")?.getAttribute("role")).toBeNull();

    render("http://localhost:3777");
    expect(host.querySelector(".setup-public-preview code")?.textContent).toBe(
      "http://localhost:3777/mcp"
    );
    expect(host.querySelector(".setup-public-guidance")?.getAttribute("role")).toBe("status");

    render("https://kgos.example.com");
    expect(host.querySelector("#setup-public-origin")?.getAttribute("aria-invalid")).toBe("false");
    expect(host.querySelector(".setup-public-preview code")?.textContent).toBe(
      "https://kgos.example.com/mcp"
    );
    expect(host.querySelector(".setup-public-guidance")?.getAttribute("role")).toBeNull();
  } finally {
    act(() => {
      root.unmount();
    });
    host.remove();
  }
});
