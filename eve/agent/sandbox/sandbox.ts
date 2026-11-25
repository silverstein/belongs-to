import { defineSandbox } from "eve/sandbox";
import { DockerSandbox } from "eve/sandbox/docker";
import { VercelSandbox } from "eve/sandbox/vercel";

const hosted = process.env.VERCEL === "1";
const vercel = VercelSandbox.environment();
const docker = DockerSandbox.environment();

export const environment = hosted ? vercel : docker;

export default defineSandbox(() => hosted
  ? vercel.open({ networkPolicy: "deny-all" })
  : docker.open({ networkPolicy: "deny-all" }));
