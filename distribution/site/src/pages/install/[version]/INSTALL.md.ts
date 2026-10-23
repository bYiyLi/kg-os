import type { APIRoute } from "astro";
import { getInstallationInstructions, installationVersions } from "../../../lib/installations";

export function getStaticPaths() {
  return installationVersions.map((version) => ({ params: { version } }));
}
export const GET: APIRoute = ({ params }) =>
  new Response(getInstallationInstructions(params.version!), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" }
  });
