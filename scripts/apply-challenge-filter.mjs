import { readFile, writeFile } from "node:fs/promises";
import { challengeRating } from "./challenge-rating.mjs";

const file = new URL("../web/public/data/commanders.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));
data.cards = data.cards.map((card) => ({ ...card, ...challengeRating(card) }));
await writeFile(file, JSON.stringify(data));

const hidden = data.cards.filter((card) => card.challengePick).length;
console.log(`Classified ${hidden} challenge picks; ${data.cards.length - hidden} commanders remain in default discovery.`);
