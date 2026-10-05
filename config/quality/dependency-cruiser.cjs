/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true }
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true }
    },
    {
      name: "sdk-stays-client-independent",
      severity: "error",
      from: { path: "^packages/sdk/" },
      to: { path: "^packages/web/" }
    },
    {
      name: "web-shared-stays-independent",
      severity: "error",
      from: { path: "^packages/web/src/shared/" },
      to: { path: "^packages/(web/src/(main\\.tsx|app/|core/|features/)|sdk/)" }
    },
    {
      name: "web-core-stays-below-features",
      severity: "error",
      from: { path: "^packages/web/src/core/" },
      to: { path: "^packages/web/src/(main\\.tsx|app/|features/)" }
    },
    {
      name: "web-features-stay-below-app",
      severity: "error",
      from: { path: "^packages/web/src/features/" },
      to: { path: "^packages/web/src/(main\\.tsx|app/)" }
    },
    {
      name: "web-app-stays-below-entrypoint",
      severity: "error",
      from: { path: "^packages/web/src/app/" },
      to: { path: "^packages/web/src/main\\.tsx$" }
    },
    {
      name: "web-entrypoint-only-composes-app",
      severity: "error",
      from: { path: "^packages/web/src/main\\.tsx$" },
      to: { path: "^packages/web/src/(core|features|shared)/" }
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: ["^packages/[^/]+/dist/"] },
    enhancedResolveOptions: {
      conditionNames: ["import", "node", "default", "types"],
      exportsFields: ["exports"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]
    },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: "specify"
  }
};
