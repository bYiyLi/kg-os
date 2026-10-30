import { resolve } from "node:path";

export const LITHOGRAPH_VERSION = "0.3.4";

const artifacts = {
  "darwin-arm64": {
    archive: "lithograph-macos-arm64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "fd17fde21d310cce9f889c8416232f9c9bb79aa17d5ead74452e89e349465a60"
  },
  "darwin-x64": {
    archive: "lithograph-macos-x64.tar.gz",
    library: "lithograph.dylib",
    providerLibrary: "lithograph-openai-compatible.dylib",
    sha256: "bf9eefbefa808102e20bfe2cdb3edf8676dd9c08e93f67dfb4f82fe5a7e87d07"
  },
  "linux-arm64": {
    archive: "lithograph-linux-arm64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "12ccb1803f7caa8546a9f36f03c3436e181029244dc58215b96af1ea0880ecab"
  },
  "linux-x64": {
    archive: "lithograph-linux-x64.tar.gz",
    library: "lithograph.so",
    providerLibrary: "lithograph-openai-compatible.so",
    sha256: "89e12d474703575555c8aabb0098f29019f6a4d050f6c04cafc675b556db8794"
  },
  "win32-arm64": {
    archive: "lithograph-windows-arm64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "c7d94d158b0179a4598922ca1940c62149bfa76e06cb2a0a71595473cc944bcf"
  },
  "win32-x64": {
    archive: "lithograph-windows-x64.zip",
    library: "lithograph.dll",
    providerLibrary: "lithograph-openai-compatible.dll",
    sha256: "72f12bed10c8915c35b40179e4b651c3f34056e175ddab1db708833ae5eefa72"
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
