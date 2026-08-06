import { readFile, writeFile } from "node:fs/promises";
import { deriveThemeLabels, deriveTribes } from "./theme-taxonomy.mjs";

const file = new URL("../web/public/data/commanders.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));
const headers = {
  Accept: "application/json;q=0.9,*/*;q=0.8",
  "User-Agent": "DeepCutsCommander/1.0 (https://github.com/floodiastus/EDH101)",
};
let catalog = data.creatureTypes;
if (!Array.isArray(catalog) || !catalog.length) {
  const response = await fetch("https://api.scryfall.com/catalog/creature-types", { headers });
  if (!response.ok) throw new Error(`${response.status} while loading Scryfall creature types.`);
  catalog = (await response.json()).data;
}
if (!Array.isArray(catalog) || !catalog.length) throw new Error("Scryfall returned no creature types.");
data.creatureTypes = catalog;
let changed = 0;

for (const card of data.cards ?? []) {
  const tribes = deriveTribes({
    oracleText: card.oracleText,
    typeLine: card.typeLine,
    existingThemes: Array.isArray(card.themes) ? card.themes : [],
    creatureTypes: catalog,
  });
  const themes = deriveThemeLabels({
    oracleText: card.oracleText,
    typeLine: card.typeLine,
    existingThemes: Array.isArray(card.themes) ? card.themes : [],
    creatureTypes: catalog,
    tribes,
  });
  if (JSON.stringify(themes) !== JSON.stringify(card.themes) || JSON.stringify(tribes) !== JSON.stringify(card.tribes ?? [])) changed += 1;
  card.themes = themes;
  card.tribes = tribes;
}

await writeFile(file, JSON.stringify(data));
console.log(`Expanded theme taxonomy for ${changed} of ${data.cards?.length ?? 0} commanders.`);
