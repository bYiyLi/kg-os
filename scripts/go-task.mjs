import { mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { currentLithographArtifact } from "./lithograph-artifacts.mjs";
import { run, runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const task = process.argv[2];
const goEnv = {
  ...process.env,
  CGO_ENABLED: "1",
  GOTOOLCHAIN: "go1.27.1"
};
const sqliteTags = "sqlite_fts5";
const nativeTags = "sqlite_fts5,lithograph_smoke";

async function nativeEnvironment() {
  await run("node", ["scripts/prepare-lithograph.mjs"], { cwd: root, env: goEnv });
  const artifact = currentLithographArtifact(root);
  return {
    ...goEnv,
    KGOS_LITHOGRAPH_LIBRARY: resolve(artifact.cacheDirectory, artifact.library),
    KGOS_LITHOGRAPH_PROVIDER_LIBRARY: resolve(artifact.cacheDirectory, artifact.providerLibrary)
  };
}

async function requireGo1271() {
  const result = await runCapture("go", ["version"], { cwd: root, env: goEnv });
  if (!result.stdout.includes("go1.27.1")) {
    throw new Error("KG OS requires Go 1.27.1; got " + result.stdout.trim());
  }
}

async function collectGoFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const current = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectGoFiles(current)));
    } else if (entry.isFile() && entry.name.endsWith(".go")) {
      files.push(current);
    }
  }
  return files;
}

async function gofmt(write) {
  const goroot = (
    await runCapture("go", ["env", "GOROOT"], { cwd: root, env: goEnv })
  ).stdout.trim();
  const executable = join(goroot, "bin", process.platform === "win32" ? "gofmt.exe" : "gofmt");
  const files = [
    ...(await collectGoFiles(resolve(root, "cmd"))),
    ...(await collectGoFiles(resolve(root, "internal")))
  ];
  if (write) {
    await run(executable, ["-w", ...files], { cwd: root, env: goEnv });
    return;
  }
  const result = await runCapture(executable, ["-l", ...files], { cwd: root, env: goEnv });
  if (result.stdout.trim() !== "") {
    throw new Error("gofmt required for:\n" + result.stdout.trim());
  }
}

async function check() {
  await requireGo1271();
  await gofmt(false);
  await run("go", ["mod", "verify"], { cwd: root, env: goEnv });
  await run("go", ["mod", "tidy", "-diff"], { cwd: root, env: goEnv });
  await run("go", ["vet", "-tags=" + sqliteTags, "./..."], { cwd: root, env: goEnv });
  await run("go", ["tool", "staticcheck", "-tags=" + sqliteTags, "./..."], {
    cwd: root,
    env: goEnv
  });
  await run("go", ["test", "-tags=" + sqliteTags, "-count=1", "./..."], {
    cwd: root,
    env: goEnv
  });
}

async function test(extraArguments = []) {
  await requireGo1271();
  await run("go", ["test", "-tags=" + sqliteTags, "-count=1", ...extraArguments, "./..."], {
    cwd: root,
    env: goEnv
  });
}

async function coverage() {
  await requireGo1271();
  const env = await nativeEnvironment();
  await mkdir(resolve(root, "coverage"), { recursive: true });
  await run(
    "go",
    [
      "test",
      "-tags=" + nativeTags,
      "-count=1",
      "-coverpkg=./...",
      "-covermode=atomic",
      "-coverprofile=coverage/go.out",
      "./..."
    ],
    { cwd: root, env }
  );
  const result = await runCapture("go", ["tool", "cover", "-func=coverage/go.out"], {
    cwd: root,
    env: goEnv
  });
  process.stdout.write(result.stdout);
  const match = result.stdout.match(/total:\s+\(statements\)\s+([\d.]+)%/);
  if (match === null || Number(match[1]) < 90) {
    throw new Error("Go statement coverage must remain at or above 90%");
  }
}

async function race() {
  await requireGo1271();
  const env = await nativeEnvironment();
  await run("go", ["test", "-tags=" + nativeTags, "-count=1", "-race", "./..."], {
    cwd: root,
    env
  });
}

async function security() {
  await requireGo1271();
  await run(
    "go",
    ["tool", "govulncheck", "-test", "-tags=" + sqliteTags + ",lithograph_smoke", "./..."],
    {
      cwd: root,
      env: goEnv
    }
  );
}

switch (task) {
  case "check":
    await check();
    break;
  case "coverage":
    await coverage();
    break;
  case "format":
    await requireGo1271();
    await gofmt(true);
    break;
  case "race":
    await race();
    break;
  case "security":
    await security();
    break;
  case "test":
    await test();
    break;
  default:
    throw new Error("Unknown Go task: " + String(task));
}
