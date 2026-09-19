import "./style.css";
import { mountShell } from "./shell.js";

const app = document.querySelector<HTMLElement>("#app");
mountShell(app);
