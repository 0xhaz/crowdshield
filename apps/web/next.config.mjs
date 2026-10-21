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
  // The landing page's "Try it now" and news call the API's public routes from the browser,
  // same-origin (production: Caddy routes /v1 to the API directly).
  async rewrites() {
    const api = process.env.API_URL ?? "http://localhost:4020";
    return [
      { source: "/v1/public/:path*", destination: `${api}/v1/public/:path*` },
      { source: "/v1/news", destination: `${api}/v1/news` },
    ];
  },
};

export default nextConfig;
