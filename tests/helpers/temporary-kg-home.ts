import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TemporaryKgHome {
  readonly cleanup: () => Promise<void>;
  readonly environment: NodeJS.ProcessEnv;
  readonly home: string;
}

export async function createTemporaryKgHome(): Promise<TemporaryKgHome> {
  const home = await mkdtemp(join(tmpdir(), "kgos-test-"));

  return {
    cleanup: () => rm(home, { force: true, recursive: true }),
    environment: { ...process.env, KG_HOME: home },
    home
  };
}
