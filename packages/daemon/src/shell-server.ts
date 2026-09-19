import { readFile, realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

export interface ShellServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly webRoot: string;
}

export interface RunningShellServer {
  readonly close: () => Promise<void>;
  readonly origin: string;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendText(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end(text);
}

function isReservedPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/control" ||
    pathname.startsWith("/control/")
  );
}

function decodePathname(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

function resolveInsideRoot(root: string, pathname: string): string | undefined {
  const candidate = resolve(root, `.${pathname}`);
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : undefined;
}

async function existingFile(root: string, path: string): Promise<string | undefined> {
  try {
    const canonicalPath = await realpath(path);
    if (canonicalPath !== root && !canonicalPath.startsWith(`${root}${sep}`)) {
      return undefined;
    }
    const info = await stat(canonicalPath);
    return info.isFile() ? canonicalPath : undefined;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return undefined;
    }
    throw error;
  }
}

async function selectFile(root: string, pathname: string): Promise<string | undefined> {
  const candidate = resolveInsideRoot(root, pathname);
  if (candidate === undefined) {
    return undefined;
  }

  const canonicalRoot = await realpath(root);
  const direct = await existingFile(canonicalRoot, candidate);
  if (direct !== undefined) {
    return direct;
  }

  return extname(pathname) === ""
    ? existingFile(canonicalRoot, resolve(root, "index.html"))
    : undefined;
}

async function handleRequest(
  root: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    sendText(response, 405, "Method Not Allowed\n");
    return;
  }

  const encodedPathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const pathname = decodePathname(encodedPathname);
  if (pathname === undefined || isReservedPath(pathname)) {
    sendText(response, 404, "Not Found\n");
    return;
  }

  const file = await selectFile(root, pathname === "/" ? "/index.html" : pathname);
  if (file === undefined) {
    sendText(response, 404, "Not Found\n");
    return;
  }

  const body = await readFile(file);
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": body.byteLength,
    "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
    "x-content-type-options": "nosniff"
  });
  response.end(method === "HEAD" ? undefined : body);
}

export function createStaticShellServer(webRoot: string): Server {
  const root = resolve(webRoot);
  return createServer((request, response) => {
    void handleRequest(root, request, response).catch(() => {
      if (!response.headersSent) {
        sendText(response, 500, "Internal Server Error\n");
      } else {
        response.destroy();
      }
    });
  });
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
}

function close(server: Server): Promise<void> {
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

export async function startStaticShellServer(
  options: ShellServerOptions
): Promise<RunningShellServer> {
  const host = options.host ?? "127.0.0.1";
  const server = createStaticShellServer(options.webRoot);
  await listen(server, host, options.port ?? 0);

  const address = server.address();
  if (address === null || typeof address === "string") {
    await close(server);
    throw new Error("Static shell server did not expose a TCP address");
  }

  return {
    close: () => close(server),
    origin: `http://${host}:${String(address.port)}`
  };
}
