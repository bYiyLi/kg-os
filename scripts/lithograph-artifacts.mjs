import { resolve } from "node:path";

export const LITHOGRAPH_VERSION = "0.3.3";

const artifacts = {
  "darwin-arm64": {
    archive: "lithograph-macos-arm64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "ba8fd08bd84d3516c9c2e6e8168f507b83de6b8cb6eea2c66cff65760b1ce997"
  },
  "darwin-x64": {
    archive: "lithograph-macos-x64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "507359aaea081fd2bac975a93d977d3e0345eb1c08ef7c04327449e34d05bf9f"
  },
  "linux-arm64": {
    archive: "lithograph-linux-arm64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "65fe4ac6ce8c481dd6108a67a744da1e66a1c7d3e2091f11bbb7eb7d2e6ccd89"
  },
  "linux-x64": {
    archive: "lithograph-linux-x64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "7340c320e9b99c075271dcff5a3177f6997382e6c957dcd62dacdd48516236f5"
  },
  "win32-arm64": {
    archive: "lithograph-windows-arm64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "b820308d5265ac8673c6ebf4c60efab1dfef4bf39d153c586d63df02a6aeb57c"
  },
  "win32-x64": {
    archive: "lithograph-windows-x64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "4bd404168a1e60cc6ae8cf18e888f65b36f14221d90ea106cc709945344baaf1"
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
