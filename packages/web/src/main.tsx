import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/app.js";
import "./app/styles/tokens.css";
import "./app/styles/global.css";
import "./app/styles/layout.css";
import "./app/styles/authentication.css";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) {
  throw new Error("Missing #app mount point");
}

createRoot(app).render(
  <StrictMode>
    <App />
  </StrictMode>
);
