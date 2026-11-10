import { resolve } from "node:path";

export const LITHOGRAPH_VERSION = "0.3.5";

const artifacts = {
  "darwin-arm64": {
    archive: "lithograph-macos-arm64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "dbfe9c40bea4231f6aeda0b445f967640817ded83f3a8d9c3914c68710f2b779"
  },
  "darwin-x64": {
    archive: "lithograph-macos-x64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "81b00c925c45af53d4d0deabd918b85943c678c95612668a7cdad10bff352e9e"
  },
  "linux-arm64": {
    archive: "lithograph-linux-arm64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "358a7c7fffb061b1793d5992671cf5396d7e7a7f427b6c4ff77fec97d48c6950"
  },
  "linux-x64": {
    archive: "lithograph-linux-x64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "504b6dd3321007abdd4d7aff2a87ab3219518b39fec583662debea7f6fa8f7dc"
  },
  "win32-arm64": {
    archive: "lithograph-windows-arm64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "4aeb82ca08f3dc10c2815fa827da66a62ae9fee65d605197eec7b73eaa9ae5bf"
  },
  "win32-x64": {
    archive: "lithograph-windows-x64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "7c4990cccec097991983bc1c6f7bd7401503aa806bc668e52932a9708969e6be"
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
