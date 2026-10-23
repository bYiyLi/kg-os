import type { APIRoute } from "astro";
import { getInstallation, latestInstallationVersion } from "../../lib/installations";

export const GET: APIRoute = () =>
  new Response(getInstallation("en", latestInstallationVersion).raw, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" }
  });
