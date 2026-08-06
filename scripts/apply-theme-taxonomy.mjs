import { readFile, writeFile } from "node:fs/promises";
import { deriveThemeLabels } from "./theme-taxonomy.mjs";

const file = new URL("../web/public/data/commanders.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));
let changed = 0;

for (const card of data.cards ?? []) {
  const themes = deriveThemeLabels({
    oracleText: card.oracleText,
    typeLine: card.typeLine,
    existingThemes: Array.isArray(card.themes) ? card.themes : [],
  });
  if (JSON.stringify(themes) !== JSON.stringify(card.themes)) changed += 1;
  card.themes = themes;
}

await writeFile(file, JSON.stringify(data));
console.log(`Expanded theme taxonomy for ${changed} of ${data.cards?.length ?? 0} commanders.`);
