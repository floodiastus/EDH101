const IRREGULAR_PLURALS = new Map([
  ["dwarf", "dwar(?:f|ves)"],
  ["elf", "el(?:f|ves)"],
  ["mouse", "m(?:ouse|ice)"],
  ["wolf", "wol(?:f|ves)"],
]);

const escapeRegExp = (value) => value.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");

function subtypePattern(subtype) {
  const lower = subtype.toLowerCase();
  const irregular = IRREGULAR_PLURALS.get(lower);
  if (irregular) return irregular;
  const words = lower.split(" ");
  const last = words.pop() ?? lower;
  const plural = /[^aeiou]y$/.test(last)
    ? `${escapeRegExp(last.slice(0, -1))}(?:y|ies)`
    : /(?:s|sh|ch|x|z)$/.test(last)
      ? `${escapeRegExp(last)}(?:es)?`
      : `${escapeRegExp(last)}(?:s|es)?`;
  return [...words.map(escapeRegExp), plural].join("\\s+");
}

function supportsCreatureType(text, creatureType) {
  const kind = subtypePattern(creatureType);
  return [
    `\\b(?:other|each|every|all)\\s+${kind}\\s+(?:you control\\s+)?(?:are|get|gets|have|has|gain|gains|cost|can|may|enter|enters|attack|attacks|die|dies)\\b`,
    `\\b${kind}\\s+(?:spells?|cards?|creatures?|permanents?)\\s+(?:you control|you own|you cast|in your|from your)\\b`,
    `\\bwhenever\\s+(?:an?|another|one or more|other)\\s+${kind}\\s+(?:you control\\s+)?(?:enters|attacks|dies|leaves|deals|becomes|is put)\\b`,
    `\\b(?:for each|number of)\\s+${kind}\\b`,
    `\\b(?:cast|sacrifice|tap|untap|reveal|return|discard|exile)\\s+(?:an?|another|one or more|any number of|up to \\w+)\\s+${kind}\\b`,
    `\\b(?:regenerate|untap)\\s+(?:another\\s+)?target\\s+${kind}\\b`,
    `\\bput\\s+[^.]+?counters?\\s+on\\s+(?:another\\s+)?target\\s+${kind}(?:\\s+you control)?\\b`,
    `\\b${kind}\\s+cards?\\s+(?:from among|in your|you reveal|you own)\\b`,
  ].some((pattern) => new RegExp(pattern).test(text));
}

export function deriveTribes({ oracleText = "", typeLine = "", existingThemes: _existingThemes = [], creatureTypes = [] }) {
  const text = String(oracleText).toLowerCase();
  const catalog = Array.from(new Set(creatureTypes.map(String).filter(Boolean)));
  const tribes = [];
  const add = (creatureType) => {
    if (creatureType && !tribes.includes(creatureType)) tribes.push(creatureType);
  };

  for (const creatureType of catalog) {
    if (supportsCreatureType(text, creatureType)) add(creatureType);
  }

  return tribes.slice(0, 4);
}

function supportsFlexibleTribe(text) {
  return /choose a creature type|chosen creature type|every creature type|all creature types/.test(text);
}

export function deriveThemeLabels({ oracleText = "", typeLine = "", existingThemes = [], creatureTypes = [], tribes = null }) {
  const text = String(oracleText).toLowerCase();
  const type = String(typeLine).toLowerCase();
  const normalized = existingThemes.filter((theme) => theme !== "Tribal" && theme !== "Typal");
  const detectedTribes = tribes ?? deriveTribes({ oracleText, typeLine, existingThemes, creatureTypes });
  const themes = new Set(normalized);
  const add = (condition, label) => { if (condition) themes.add(label); };

  add(detectedTribes.length > 0 || supportsFlexibleTribe(text), "Tribal");
  add(/\+1\/\+1 counters?/.test(text), "+1/+1 Counters");
  add(
    /\b(?:put|remove|move|double|distribute)\b[^.!?\n]{0,80}\bcounters?\b|\bcounters?\b[^.!?\n]{0,50}\b(?:on|among)\b|\bproliferate\b/.test(text),
    "Counters",
  );
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
