import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Shell } from "./shell.js";
import "./style.css";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) {
  throw new Error("Missing #app mount point");
}

createRoot(app).render(
  <StrictMode>
    <Shell />
  </StrictMode>
);
