import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";

import { createServer as createViteServer, type ViteDevServer } from "vite";

export interface DevelopmentHostOptions {
  readonly port?: number;
}

export interface RunningDevelopmentHost {
  readonly close: () => Promise<void>;
  readonly origin: string;
}

const webRoot = fileURLToPath(new URL("../../web", import.meta.url));
const configFile = fileURLToPath(new URL("../../web/vite.config.ts", import.meta.url));

export function parseDevelopmentPort(raw: string | undefined): number {
  const value = raw ?? "4765";
  const port = Number(value);
  if (value.trim().length === 0 || !Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid KGOS_DEV_PORT: ${value}`);
  }
  return port;
}

function isReservedRequest(url: string | undefined): boolean {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url ?? "/", "http://localhost").pathname);
  } catch {
    return true;
  }
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/control" ||
    pathname.startsWith("/control/")
  );
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolvePromise();
      } else {
        reject(error);
      }
    });
  });
}

export async function startDevelopmentHost(
  options: DevelopmentHostOptions = {}
): Promise<RunningDevelopmentHost> {
  const runtime: { vite: ViteDevServer | undefined } = { vite: undefined };
  const server = createServer((request, response) => {
    if (isReservedRequest(request.url)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not Found\n");
      return;
    }

    runtime.vite?.middlewares(request, response, () => {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not Found\n");
    });
  });

  const vite = await createViteServer({
    appType: "spa",
    configFile,
    root: webRoot,
    server: { hmr: { server }, middlewareMode: true }
  });
  runtime.vite = vite;

  try {
    await listen(server, options.port ?? parseDevelopmentPort(process.env["KGOS_DEV_PORT"]));
  } catch (error: unknown) {
    await vite.close();
    throw error;
  }

  const address = server.address();
  if (address === null || typeof address === "string") {
    await Promise.all([vite.close(), closeServer(server)]);
    throw new Error("Development host did not expose a TCP address");
  }

  let closing: Promise<void> | undefined;
  return {
    close: () => {
      closing ??= Promise.all([vite.close(), closeServer(server)]).then(() => undefined);
      return closing;
    },
    origin: `http://127.0.0.1:${String(address.port)}`
  };
}
