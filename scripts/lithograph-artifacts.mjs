import { resolve } from "node:path";

export const LITHOGRAPH_VERSION = "0.3.7";

const artifacts = {
  "darwin-arm64": {
    archive: "lithograph-macos-arm64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "08cec6f8addc4ceba469ee53ee20a33887f88433e985ccb6daee5a44874ecc6d"
  },
  "darwin-x64": {
    archive: "lithograph-macos-x64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "b5588f3a94d2ce13dc53f07ae783211eae9b3f7127e6176fb40d91e47c884b9e"
  },
  "linux-arm64": {
    archive: "lithograph-linux-arm64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "eef27d64103060d4106154d0e0d80e181dbedcc6283ae62874e3493962a529d6"
  },
  "linux-x64": {
    archive: "lithograph-linux-x64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "762947714026873e8da5e2b9b4b04966e225f9dc9d663619339614e66836873d"
  },
  "win32-arm64": {
    archive: "lithograph-windows-arm64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "3cbd958c77fb679f2aa1360b3436aa258f08778d9b23a606733e0c76a7af8ddf"
  },
  "win32-x64": {
    archive: "lithograph-windows-x64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "7a1a6890d8a21735a349c6e96711178845451f774577acd126cdac469e045bad"
  }
};

export function currentLithographArtifact(root) {
  const key = `${process.platform}-${process.arch}`;
  const artifact = artifacts[key];
  if (artifact === undefined) {
    throw new Error(
      `No KG OS Lithograph artifact for ${key}; supported targets are macOS/Linux/Windows x64/arm64`
    );
  }

  const cacheDirectory = resolve(root, ".cache", "lithograph", `v${LITHOGRAPH_VERSION}`, key);
  return {
    ...artifact,
    cacheDirectory,
    key,
    url: `https://github.com/bYiyLi/Lithograph/releases/download/v${LITHOGRAPH_VERSION}/${artifact.archive}`
  };
}
