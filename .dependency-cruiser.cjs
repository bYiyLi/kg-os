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
      name: "contracts-stays-independent",
      severity: "error",
      from: { path: "^packages/contracts/" },
      to: { path: "^packages/(?:kernel|daemon|sdk|cli|web)/" }
    },
    {
      name: "kernel-only-depends-on-contracts",
      severity: "error",
      from: { path: "^packages/kernel/" },
      to: { path: "^packages/(?:daemon|sdk|cli|web)/" }
    },
    {
      name: "daemon-does-not-depend-on-clients",
      severity: "error",
      from: { path: "^packages/daemon/" },
      to: { path: "^packages/(?:sdk|cli|web)/" }
    },
    {
      name: "sdk-does-not-depend-on-server",
      severity: "error",
      from: { path: "^packages/sdk/" },
      to: { path: "^packages/(?:kernel|daemon|cli|web)/" }
    },
    {
      name: "clients-do-not-depend-on-server",
      severity: "error",
      from: { path: "^packages/(?:cli|web)/" },
      to: { path: "^packages/(?:kernel|daemon)/" }
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
