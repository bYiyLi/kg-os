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
