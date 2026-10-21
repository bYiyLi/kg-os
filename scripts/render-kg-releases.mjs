import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const publicRepository = "bYiyLi/kg-releases";
const sourceRepository = "bYiyLi/kg-os";
const generatedFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".gitignore",
  "INSTALL.md",
  "MAINTAINING.md",
  "README.md"
];

function git(directory, ...args) {
  return execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function sourceRefKind(ref) {
  if (ref === "refs/heads/main") {
    return "main";
  }
  if (/^refs\/tags\/v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(ref)) {
    return "tag";
  }
  throw new Error("Only private main and version-tag pushes can generate kg-releases");
}

function inside(directory, parent) {
  const path = relative(parent, directory);
  return !path || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function trackedFiles(directory) {
  try {
    return execFileSync("git", ["-C", directory, "ls-files", "-z"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function collectFiles(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (prefix === "" && entry.name === ".git") {
      continue;
    }
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      paths.push(...(await collectFiles(root, path)));
    } else if (entry.isFile()) {
      paths.push(path);
    } else {
      throw new Error(`Unsupported public output entry: ${path}`);
    }
  }
  return paths;
}

export async function render({ output, ref, revision }) {
  const kind = sourceRefKind(ref);
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("A full lowercase source revision is required");
  }
  if (git(sourceRoot, "rev-parse", "HEAD") !== revision) {
    throw new Error("Source revision does not equal the checked-out commit");
  }
  if (kind === "tag" && git(sourceRoot, "rev-parse", `${ref}^{commit}`) !== revision) {
    throw new Error("The source release tag does not point to this commit");
  }

  const target = resolve(output);
  if (inside(target, sourceRoot)) {
    throw new Error("Public output must not be inside the private source repository");
  }
  await mkdir(target, { recursive: true });
  const canonicalTarget = await realpath(target);
  if (inside(canonicalTarget, sourceRoot)) {
    throw new Error("Public output resolves inside the private source repository");
  }
  const targetGit = join(canonicalTarget, ".git");
  try {
    const gitMeta = await stat(targetGit);
    if (!gitMeta.isDirectory() && !gitMeta.isFile()) {
      throw new Error("Unsupported public Git metadata");
    }
    if (resolve(git(canonicalTarget, "rev-parse", "--show-toplevel")) !== canonicalTarget) {
      throw new Error("Public output must be its own Git repository");
    }
    try {
      const remote = git(canonicalTarget, "remote", "get-url", "origin");
      if (
        !/^((https:\/\/github\.com\/)|(git@github\.com:))bYiyLi\/kg-releases(?:\.git)?$/.test(
          remote
        )
      ) {
        throw new Error("Refusing to generate into a different Git repository");
      }
    } catch (error) {
      if (!String(error.message).includes("No such remote")) {
        throw error;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const expected = new Set([...generatedFiles, "source.json"]);
  const tracked = new Set(trackedFiles(canonicalTarget));
  const existing = await collectFiles(canonicalTarget);
  for (const path of existing) {
    if (!expected.has(path) && !tracked.has(path)) {
      throw new Error(`Refusing to overwrite unmanaged public file: ${path}`);
    }
  }
  for (const path of tracked) {
    if (!expected.has(path)) {
      await rm(join(canonicalTarget, path));
    }
  }
  for (const path of generatedFiles) {
    const template = join(sourceRoot, "distribution", path);
    const content = await readFile(template);
    const dest = join(canonicalTarget, path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content);
  }
  const manifest = {
    schema: 1,
    repository: sourceRepository,
    revision,
    ref
  };
  await writeFile(join(canonicalTarget, "source.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    repository: publicRepository,
    source: revision,
    kind,
    files: [...expected].sort()
  };
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--output", "--ref", "--revision"].includes(args[i]) || !args[i + 1]) {
      throw new Error(
        "Usage: render-kg-releases.mjs --output <directory> --ref <git-ref> --revision <sha>"
      );
    }
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.output || !options.ref || !options.revision || Object.keys(options).length !== 3) {
    throw new Error("Required: --output, --ref, --revision");
  }
  return options;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  render(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(`Rendered kg-releases for ${result.kind} ${result.source}`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
