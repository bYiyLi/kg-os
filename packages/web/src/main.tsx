import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/app.js";
import "./app/app.css";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) {
  throw new Error("Missing #app mount point");
}

createRoot(app).render(
  <StrictMode>
    <App />
  </StrictMode>
);
