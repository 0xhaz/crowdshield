import { fileURLToPath } from "node:url";

// Load the repo-root .env (API_URL, ML gateway) for server components and actions.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // rely on the process environment
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@crowdshield/normalise"],
  experimental: { serverActions: { bodySizeLimit: "8mb" } }, // invoice uploads
};

export default nextConfig;
