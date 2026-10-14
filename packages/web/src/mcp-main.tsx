import { createRoot } from "react-dom/client";

import { EmbeddedApp } from "./app/embedded-app.js";
import "./app/styles/tokens.css";
import "./app/styles/global.css";
import "./app/styles/layout.css";

const target = document.querySelector<HTMLElement>("#app");
if (target === null) throw new Error("Missing #app mount point");

createRoot(target).render(<EmbeddedApp />);
