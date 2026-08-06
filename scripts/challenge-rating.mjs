const BUILD_AROUND_HOOKS = [
  "whenever", "at the beginning", "for each", "you may", "if you would", "instead",
  "create", "copy", "cast", "sacrifice", "exile", "graveyard", "counter", "choose",
  "draw", "discard", "token", "artifact", "enchantment", "land", "search your library",
  "gain control", "mill", "untap", "proliferate", "venture", "monarch", "initiative",
  "goad", "cascade", "transform", "meld", "equal to", "creatures you control",
  "spells you cast", "other creatures", "costs {", "add {", "combat damage to a player",
];

const KEYWORDS = [
  "afflict", "afterlife", "annihilator", "banding", "battle cry", "blitz", "bloodthirst",
  "bushido", "cascade", "casualty", "champion", "changeling", "deathtouch", "decayed",
  "defender", "double strike", "dredge", "echo", "exalted", "exploit", "extort", "fear",
  "first strike", "flanking", "flying", "frenzy", "graft", "haste", "hexproof", "horsemanship",
  "indestructible", "infect", "intimidate", "lifelink", "menace", "mentor", "partner",
  "persist", "protection from", "prowess", "rampage", "reach", "riot", "shadow", "shroud",
  "skulk", "soulbond", "spectacle", "trample", "undying", "unleash", "vanishing", "vigilance",
  "ward", "wither",
];

function stripReminderText(text) {
  let result = text;
  for (let pass = 0; pass < 3; pass++) result = result.replace(/\([^()]*\)/g, "");
  return result.replace(/\s+/g, " ").trim().toLowerCase();
}

function keywordOnly(text) {
  const pieces = text.split(/[\n,;]+/).map((item) => item.trim().replace(/[.!]$/, "")).filter(Boolean);
  return pieces.length > 0 && pieces.every((piece) => KEYWORDS.some((keyword) => piece === keyword || piece.startsWith(keyword + " ")));
}

export function challengeRating(card) {
  const text = stripReminderText(String(card.oracleText ?? ""));
  const hooks = BUILD_AROUND_HOOKS.filter((hook) => text.includes(hook));
  if (!text) return { challengePick: true, challengeReason: "No rules-text engine or deckbuilding hook." };
  if (keywordOnly(text)) return { challengePick: true, challengeReason: "Its text is almost entirely combat keywords." };

  const obsoleteHoser = /can be blocked as though .*didn['’]t have .*walk|protection from (white|blue|black|red|green)$/.test(text);
  if (obsoleteHoser && hooks.length === 0) return { challengePick: true, challengeReason: "An obsolete or extremely matchup-dependent hoser." };

  const genericPump = /:\s*target creature (you control )?gets [+-]\d+\/[+-]\d+ until end of turn/.test(text);
  if (genericPump && hooks.length === 0 && text.length < 170) return { challengePick: true, challengeReason: "A generic combat trick rather than a commander engine." };

  if (text.includes("grandeur") && hooks.length <= 1) return { challengePick: true, challengeReason: "Its signature mechanic does not function naturally in singleton." };

  let flatness = 0;
  if (text.length < 90) flatness += 2;
  if (hooks.length === 0) flatness += 2;
  if (Number(card.manaValue ?? 0) >= 6 && hooks.length === 0) flatness += 1;
  if (/can['’]t be blocked|gets [+-]\d+\/[+-]\d+$|must be blocked/.test(text)) flatness += 1;
  if (flatness >= 4) return { challengePick: true, challengeReason: "Very little repeatable value or room for a distinct engine." };

  return { challengePick: false, challengeReason: "" };
}
