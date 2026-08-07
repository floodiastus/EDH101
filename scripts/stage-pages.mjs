import { copyFile, cp, mkdir, readdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

const rootAssets = new URL("assets/", root);
await mkdir(rootAssets, { recursive: true });
await mkdir(new URL("data/", root), { recursive: true });
for (const filename of await readdir(rootAssets)) {
  if (/^(?:app|index)(?:-[a-zA-Z0-9_-]+)?\.(?:js|css)$/.test(filename)) {
    await rm(new URL(filename, rootAssets));
  }
}
await copyFile(new URL("index.html", dist), new URL("index.html", root));
await cp(new URL("assets/", dist), new URL("assets/", root), { recursive: true, force: true });
await copyFile(new URL("data/commanders.json", dist), new URL("data/commanders.json", root));
await copyFile(new URL(".nojekyll", dist), new URL(".nojekyll", root));

console.log("Staged the production site at the repository root for branch-based GitHub Pages.");
