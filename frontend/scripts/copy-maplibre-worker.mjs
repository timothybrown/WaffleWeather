// MapLibre GL 6 loads its tile worker from a URL next to its own module file.
// Bundling moves the module, so that URL 404s and the map never draws. Serve
// the worker (plus the shared chunk it imports) from public/ instead, under a
// versioned directory so a cached worker can never pair with a newer bundle.
// LightningMap.tsx points setWorkerUrl() here. Runs before `dev` and `build`.
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const dist = path.join(path.dirname(pkgPath), "dist");

const outRoot = new URL("../public/maplibre/", import.meta.url);
rmSync(outRoot, { recursive: true, force: true });
const outDir = new URL(`${version}/`, outRoot);
mkdirSync(outDir, { recursive: true });

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(dist, file), new URL(file, outDir));
}
console.log(`MapLibre ${version} worker copied to public/maplibre/${version}/`);
