const TRIBAL_TAGS = new Set([
  "Angels", "Assassins", "Bats", "Beasts", "Birds", "Cats", "Clerics", "Demons",
  "Dinosaurs", "Dogs", "Dragons", "Druids", "Dwarves", "Eldrazi", "Elves", "Faeries",
  "Frogs", "Giants", "Goblins", "Golems", "Horses", "Humans", "Hydras", "Insects",
  "Knights", "Kor", "Merfolk", "Mutants", "Ninjas", "Oozes", "Orcs", "Phyrexians",
  "Pirates", "Rats", "Robots", "Rogues", "Saprolings", "Shamans", "Shapeshifters",
  "Slivers", "Soldiers", "Spirits", "Thopters", "Treefolk", "Vampires", "Warriors",
  "Werewolves", "Wizards", "Wolves", "Wraiths", "Zombies",
]);

const IRREGULAR_PLURALS = new Map([
  ["dwarf", "dwar(?:f|ves)"],
  ["elf", "el(?:f|ves)"],
  ["mouse", "m(?:ouse|ice)"],
  ["wolf", "wol(?:f|ves)"],
]);

const escapeRegExp = (value) => value.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");

function subtypePattern(subtype) {
  const lower = subtype.toLowerCase();
  return IRREGULAR_PLURALS.get(lower) ?? `${escapeRegExp(lower)}(?:s|es)?`;
}

function referencesOwnCreatureType(text, typeLine) {
  if (/creature type|chosen type|of the chosen type/.test(text)) return true;
  const subtypes = typeLine
    .split("//")
    .flatMap((face) => {
      const [, subtypeText = ""] = face.split("—", 2);
      return subtypeText.trim().split(/\s+/);
    })
    .map((item) => item.toLowerCase())
    .filter((item) => item && item !== "background");

  return subtypes.some((subtype) => {
    const kind = subtypePattern(subtype);
    return new RegExp(`\\b(?:other|each|every|another|target|one or more|number of|for each)\\s+${kind}\\b`).test(text)
      || new RegExp(`\\b${kind}\\s+(?:you control|cards?|spells?|creatures?|permanents?|get|gets|have|gain|enter|enters|die|dies|attack|attacks)\\b`).test(text);
  });
}

export function deriveThemeLabels({ oracleText = "", typeLine = "", existingThemes = [] }) {
  const text = String(oracleText).toLowerCase();
  const type = String(typeLine).toLowerCase();
  const normalized = existingThemes.map((theme) => theme === "Typal" ? "Tribal" : theme);
  const themes = new Set(normalized);
  const add = (condition, label) => { if (condition) themes.add(label); };

  add(normalized.some((theme) => TRIBAL_TAGS.has(theme)) || referencesOwnCreatureType(text, String(typeLine)), "Tribal");
  add(/\+1\/\+1 counters?/.test(text), "+1/+1 Counters");
  add(/counter on|counters on|proliferate/.test(text), "Counters");
  add(/create .* tokens?|tokens? you control|populate/.test(text), "Tokens");
  add(/sacrifice/.test(text), "Sacrifice");
  add(/sacrifice/.test(text) && /dies|died|put into (?:a|your) graveyard from the battlefield/.test(text), "Aristocrats");
  add(/graveyard|mill|surveil/.test(text), "Graveyard");
  add(/return .*?(?:creature|permanent) card .*?graveyard .*?battlefield|put .*?(?:creature|permanent) card .*?graveyard .*?battlefield/.test(text), "Reanimator");
  add(/\bmill\b/.test(text), "Mill");
  add(/discard/.test(text), "Discard");
  add(/instant|sorcery|noncreature spell|magecraft/.test(text), "Spellslinger");
  add(/artifact/.test(text) || /artifact/.test(type), "Artifacts");
  add(/equipment|equipped|\bequip\b/.test(text), "Equipment");
  add(/\baura\b|enchanted creature|enchantress/.test(text), "Auras");
  add(/enchantment spell|constellation|whenever an enchantment|enchantments? you control/.test(text), "Enchantress");
  add(/landfall|whenever (?:a|one or more) lands? enter|land enters the battlefield under your control/.test(text), "Landfall");
  add(/land card|lands? you control|play an additional land/.test(text), "Lands");
  add(/add (?:one mana|\{[wubrgc]\}|x mana)|search your library for (?:a|up to .*?) land card/.test(text), "Ramp");
  add(/\btreasure\b/.test(text), "Treasure");
  add(/\bfood\b/.test(text), "Food");
  add(/\bclue\b|investigate/.test(text), "Clues");
  add(/gain life|lifelink|life total/.test(text), "Lifegain");
  add(/each opponent loses|opponent loses .* life.*you gain|whenever an opponent loses life/.test(text), "Lifedrain");
  add(/exile .*?(?:then )?return|return (?:it|that card|them) to the battlefield|leaves the battlefield/.test(text), "Blink");
  add(/becomes? a copy|enter .* as a copy|token that(?:'s| is) a copy/.test(text), "Clones");
  add(/planeswalker/.test(text) || /planeswalker/.test(type), "Planeswalkers");
  add(/\bvehicle\b|\bcrew\b/.test(text) || /vehicle/.test(type), "Vehicles");
  add(/each player .*discard|discard your hand.*draw|discard their hands.*draw/.test(text), "Wheels");
  add(/extra combat|additional combat/.test(text), "Extra Combats");
  add(/extra turn|additional turn/.test(text), "Extra Turns");
  add(/counter target spell|spells? (?:your opponents control )?cost .* more|players can['’]t cast|your opponents can['’]t/.test(text), "Control");
  add(/each opponent|opponent chooses|voting|\bvote\b|goad|monarch/.test(text), "Politics");
  add(/coin|random|choose at random|roll a d/.test(text), "Chaos");
  add(/draw|investigate|clue/.test(text), "Card Draw");
  add(/attack|combat|attacks/.test(text), "Combat");
  add(/aura|equipment|modified/.test(text), "Voltron");

  return Array.from(themes).slice(0, 14);
}
