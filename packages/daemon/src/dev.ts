import { fileURLToPath } from "node:url";

const developmentHome = fileURLToPath(new URL("../../../.kgos-dev", import.meta.url));
process.env["KG_HOME"] = developmentHome;

const { startDevelopmentHost } = await import("./development-host.js");

const running = await startDevelopmentHost();
process.stdout.write(`KG OS development shell: ${running.origin}\nKG_HOME: ${developmentHome}\n`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void running.close().then(
      () => {
        process.exitCode = 0;
      },
      (error: unknown) => {
        process.stderr.write(`Failed to stop KG OS development shell: ${String(error)}\n`);
        process.exitCode = 1;
      }
    );
  });
}
