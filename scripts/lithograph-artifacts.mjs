import { resolve } from "node:path";

export const LITHOGRAPH_VERSION = "0.3.1";

const artifacts = {
  "darwin-arm64": {
    archive: "lithograph-macos-arm64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "27de06ef3528c477d3730274c525ca081bbad4f711f9dd32615811e97237c6fe"
  },
  "darwin-x64": {
    archive: "lithograph-macos-x64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "8ee1b0cb824d7f2c45101d1d84ed49c23378fdc95be621a2c0fa7994d918dd92"
  },
  "linux-arm64": {
    archive: "lithograph-linux-arm64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "1f0081ce3478f69575153e1c0b9cf7a22922a21170bd22c0404a4a2692e95e80"
  },
  "linux-x64": {
    archive: "lithograph-linux-x64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "b4170e31a307e71f243365d4629b359f8e2e1c1fcf9703722c7f314b858a8d1d"
  },
  "win32-arm64": {
    archive: "lithograph-windows-arm64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "d7ceb9eceeccb318099ed668a5d15b1a9aa165e9eaad72564782fe91dc0bbd43"
  },
  "win32-x64": {
    archive: "lithograph-windows-x64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "3efed000b48dabfa2ea8748900955b8db2af99bb33b6353acf36fa84ac92d1a9"
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
