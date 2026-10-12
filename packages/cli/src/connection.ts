// Shared local Instance lifecycle for other Node.js KG OS clients.
export {
  ensureClient,
  readLocator,
  endpointReachable,
  readToken,
  resolveNativeRuntime
} from "./runtime.js";
export { isInitializationComplete, resolveWorkspacePaths } from "./paths.js";
