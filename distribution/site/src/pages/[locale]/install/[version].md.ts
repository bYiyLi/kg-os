import type { APIRoute } from "astro";
import { getInstallationPaths, type InstallationGuideDocument } from "../../../lib/installations";

export const getStaticPaths = getInstallationPaths;
export const GET: APIRoute = ({ props }) =>
  new Response((props.guide as InstallationGuideDocument).raw, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" }
  });
