import { resolve } from "node:path";

export const LITHOGRAPH_VERSION = "0.1.1";

const artifacts = {
  "darwin-arm64": {
    archive: "lithograph-macos-arm64.tar.gz",
    library: "lithograph.dylib",
    sha256: "28311fef687377d08583129be4ac26b1cb9962d6442f46590579723a4ac48d5b"
  },
  "darwin-x64": {
    archive: "lithograph-macos-x64.tar.gz",
    library: "lithograph.dylib",
    sha256: "4df9631a553be4d4418f07ebb3adb6dfc1f95c8e861c6453f44a65a6ba671fda"
  },
  "linux-arm64": {
    archive: "lithograph-linux-arm64.tar.gz",
    library: "lithograph.so",
    sha256: "72ccb548d857288096a567523110eda21a1868dae0d8b91a36a9c9096d573c71"
  },
  "linux-x64": {
    archive: "lithograph-linux-x64.tar.gz",
    library: "lithograph.so",
    sha256: "dc73a730c2c8981761258753934b24673506d383b13c53ada332e3fef441c40c"
  }
};

export function currentLithographArtifact(root) {
  const key = `${process.platform}-${process.arch}`;
  const artifact = artifacts[key];
  if (artifact === undefined) {
    throw new Error(
      `No Phase 0 Lithograph artifact for ${key}; supported targets are macOS/Linux x64/arm64`
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
