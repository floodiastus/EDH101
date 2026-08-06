import { copyFile, cp, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

await mkdir(new URL("assets/", root), { recursive: true });
await mkdir(new URL("data/", root), { recursive: true });
await copyFile(new URL("index.html", dist), new URL("index.html", root));
await cp(new URL("assets/", dist), new URL("assets/", root), { recursive: true, force: true });
await copyFile(new URL("data/commanders.json", dist), new URL("data/commanders.json", root));
await copyFile(new URL("crate-dig.png", dist), new URL("crate-dig.png", root));
await copyFile(new URL("og.png", dist), new URL("og.png", root));
await copyFile(new URL(".nojekyll", dist), new URL(".nojekyll", root));

console.log("Staged the production site at the repository root for branch-based GitHub Pages.");
