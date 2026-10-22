// Bundles the extension into dist/ and zips it to apps/web/public/downloads/crowdshield-guard.zip
// (served by the landing page). `node build.mjs`.
import { build } from "esbuild";
import { zipSync } from "fflate";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
// EXT_TEST=1: a build for automated tests, with the watch sites and tab capture pre-granted
// (a test can't click Chrome's permission prompt). Never shipped.
const TEST = process.env.EXT_TEST === "1";
const dist = join(here, TEST ? "dist-test" : "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// The shared normaliser imports node:crypto for hashing, which the extension never calls
const shimCrypto = {
  name: "shim-node-crypto",
  setup(b) {
    b.onResolve({ filter: /^(node:)?crypto$/ }, () => ({ path: "crypto", namespace: "shim" }));
    b.onLoad({ filter: /.*/, namespace: "shim" }, () => ({
      contents:
        "export function createHmac() { throw new Error('not available in the extension'); }",
    }));
  },
};

const common = {
  bundle: true,
  target: "chrome116",
  minify: true,
  legalComments: "none",
  plugins: [shimCrypto],
};
await build({
  ...common,
  entryPoints: [join(here, "src/background.ts")],
  outfile: join(dist, "background.js"),
  format: "esm",
});
for (const name of ["inpage", "watch", "popup"]) {
  await build({
    ...common,
    entryPoints: [join(here, `src/${name}.ts`)],
    outfile: join(dist, `${name}.js`),
    format: "iife",
  });
}
cpSync(join(here, "static"), dist, { recursive: true });
if (TEST) {
  const m = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
  m.host_permissions = [...m.host_permissions, ...m.optional_host_permissions, "<all_urls>"];
  writeFileSync(join(dist, "manifest.json"), JSON.stringify(m, null, 2));
  console.log("extension (test build) → dist-test");
  process.exit(0);
}

const files = {};
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(dist, p)] = readFileSync(p);
  }
};
walk(dist);
const out = join(here, "../web/public/downloads");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "crowdshield-guard.zip"), zipSync(files, { level: 9 }));
console.log(
  `extension: ${Object.keys(files).length} files → apps/web/public/downloads/crowdshield-guard.zip`,
);
