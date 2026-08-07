import assert from "node:assert/strict";
import { deriveThemeLabels, deriveTribes } from "./theme-taxonomy.mjs";

const creatureTypes = ["Dragon", "Goblin", "Hero", "Mutant", "Samurai", "Skeleton", "Spider"];

function classification(oracleText, typeLine = "Legendary Creature — Human") {
  const tribes = deriveTribes({ oracleText, typeLine, creatureTypes });
  const themes = deriveThemeLabels({ oracleText, typeLine, creatureTypes, tribes });
  return { tribes, tribal: themes.includes("Tribal") };
}

for (const [label, oracleText, typeLine] of [
  ["tribe hate", "When this enters, destroy target Goblin."],
  ["stealing an opposing tribe", "{T}: Gain control of target Dragon for as long as this remains tapped."],
  ["typed token production only", "When this enters, create two 1/1 blue Mutant creature tokens."],
  ["a creature type in the card name", "When Skeleton Ship enters, draw a card.", "Legendary Creature — Skeleton"],
  ["incidental rules text", "It loses all other creature types."],
  ["a noncreature chosen card type", "Choose a card type other than creature. Spells of the chosen type cost {1} less to cast."],
  ["a multiword subtype sharing a normal word", "This gets +1/+1 for each time counter on it.", "Legendary Creature — Time Lord Doctor"],
]) {
  assert.equal(classification(oracleText, typeLine).tribal, false, `${label} should not be Tribal`);
}

for (const [label, oracleText, expectedTribe] of [
  ["anthem", "Other Heroes you control have exalted.", "Hero"],
  ["cast payoff", "Whenever you cast a Dragon spell, draw a card.", "Dragon"],
  ["targeted support", "Put a +1/+1 counter on target Spider you control.", "Spider"],
  ["tribal regeneration", "{2}: Regenerate target Samurai.", "Samurai"],
]) {
  const result = classification(oracleText);
  assert.equal(result.tribal, true, `${label} should be Tribal`);
  assert.ok(result.tribes.includes(expectedTribe), `${label} should identify ${expectedTribe}`);
}

assert.equal(classification("As this enters, choose a creature type.").tribal, true, "choose-a-type commanders should be Tribal");

function themesFor(oracleText) {
  return deriveThemeLabels({ oracleText, typeLine: "Legendary Creature â€” Human", creatureTypes });
}

for (const [label, oracleText] of [
  ["counter as an activation cost", "{T}, Remove a counter from a nonland permanent you control: Draw a card."],
  ["moving counters", "Move a counter from target permanent onto another target permanent."],
  ["counting counters", "This gets +1/+1 for each counter on permanents you control."],
  ["proliferating", "When this enters, proliferate."],
]) {
  assert.ok(themesFor(oracleText).includes("Counters"), `${label} should be Counters`);
}

assert.equal(themesFor("Counter target spell unless its controller pays {2}.").includes("Counters"), false, "counterspells should not be the Counters theme");
assert.equal(themesFor("{T}: Counter target activated ability from an artifact source unless its controller pays {W}.").includes("Counters"), false, "countering an ability from a source should not be the Counters theme");
assert.ok(themesFor("{T}, Remove a counter from a nonland permanent you control: Draw a card.").includes("Card Draw"), "counter-cost draw should retain Card Draw as a secondary theme");

console.log("Theme taxonomy regression checks passed.");
