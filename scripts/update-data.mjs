import { mkdir, writeFile } from "node:fs/promises";

const headers = {
  Accept: "application/json;q=0.9,*/*;q=0.8",
  "User-Agent": "DeepCutsCommander/1.0 (https://github.com/floodiastus/EDH101)",
};

const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, retries = 2) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (response.ok) return response.json();
  if (retries && (response.status === 429 || response.status >= 500)) {
    await wait(700);
    return fetchJson(url, retries - 1);
  }
  throw new Error(`${response.status} from ${url}`);
}

function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function oracleText(card) {
  if (card.oracle_text) return String(card.oracle_text);
  return (Array.isArray(card.card_faces) ? card.card_faces : []).map((face) => String(record(face).oracle_text ?? "")).filter(Boolean).join("\n\n");
}

function manaCost(card) {
  if (card.mana_cost) return String(card.mana_cost);
  return String(record((Array.isArray(card.card_faces) ? card.card_faces : [])[0]).mana_cost ?? "");
}

function imageUris(card) {
  const direct = record(card.image_uris);
  if (Object.keys(direct).length) return direct;
  return record(record((Array.isArray(card.card_faces) ? card.card_faces : [])[0]).image_uris);
}

function mechanicalInterest(text) {
  const lower = text.toLowerCase();
  const hooks = ["whenever", "at the beginning", "for each", "you may", "if you would", "create", "copy", "cast", "sacrifice", "exile", "graveyard", "counter", "choose", "draw", "discard", "combat", "token", "artifact", "enchantment"];
  const narrow = ["landwalk", "rampage", "bands with other", "can be blocked as though"];
  return Math.min(12, text.length / 34) + hooks.reduce((sum, hook) => sum + (lower.includes(hook) ? 3.2 : 0), 0) - narrow.reduce((sum, hook) => sum + (lower.includes(hook) ? 7 : 0), 0);
}

function deriveThemes(card, tags) {
  const text = oracleText(card).toLowerCase();
  const type = String(card.type_line ?? "").toLowerCase();
  const themes = new Set(tags.map((tag) => tag.trim()).filter(Boolean));
  const add = (condition, label) => { if (condition) themes.add(label); };
  add(/artifact/.test(text) || /artifact/.test(type), "Artifacts");
  add(/create .* token|tokens? you control|populate/.test(text), "Tokens");
  add(/graveyard|mill|surveil/.test(text), "Graveyard");
  add(/instant|sorcery|noncreature spell|magecraft/.test(text), "Spellslinger");
  add(/attack|combat|attacks/.test(text), "Combat");
  add(/counter on|counters on|proliferate/.test(text), "Counters");
  add(/sacrifice|dies|died/.test(text), "Sacrifice");
  add(/landfall|land card|lands? you control/.test(text), "Lands");
  add(/gain life|lifelink|life total/.test(text), "Lifegain");
  add(/exile .* return|enters the battlefield|leaves the battlefield/.test(text), "Blink");
  add(/aura|equipment|modified/.test(text), "Voltron");
  add(/each opponent|opponent chooses|voting|vote|goad|monarch/.test(text), "Politics");
  add(/coin|random|choose at random|roll a d/.test(text), "Chaos");
  add(/creature type|choose a creature type|kindred/.test(text), "Typal");
  add(/draw|investigate|clue/.test(text), "Card Draw");
  return Array.from(themes).slice(0, 7);
}

function explain(themes, text) {
  const lead = themes[0] ?? "Build-around";
  const lower = text.toLowerCase();
  if (lead === "Politics") return "A table-talk commander with decisions that change depending on who is ahead.";
  if (lead === "Artifacts") return "A sideways artifact engine that rewards cards most lists leave in the binder.";
  if (lead === "Graveyard") return "A graveyard deck with an unusual axis instead of the standard reanimator package.";
  if (lead === "Tokens") return "Makes ordinary token cards behave differently enough to support a genuinely personal list.";
  if (lead === "Combat") return "Turns combat sequencing into the engine, giving every attack step a small puzzle.";
  if (lead === "Spellslinger") return "A spell deck with a distinct payoff rather than another generic cost reducer.";
  if (lower.includes("choose")) return "Its modal text gives the deck several identities and rewards deliberate sequencing.";
  if (lower.includes("whenever")) return "A repeatable trigger invites experimentation without prescribing the entire ninety-nine.";
  return "Open-ended rules text leaves room to invent the deck instead of copying an established shell.";
}

function warning(deckCount, manaValue, text) {
  if (deckCount < 50) return "Almost no established lists—expect to do some original deckbuilding.";
  if (manaValue >= 6) return "The commander is expensive; the deck needs a plan that works before it arrives.";
  if (/each opponent|goad|control of/.test(text.toLowerCase())) return "Its effect is visible and political, so threat perception may run hot.";
  return "The commander supplies direction, not a win condition; you still have to choose the finish.";
}

function obscurity(deckCount, releasedAt) {
  const ageMonths = Math.max(0, (Date.now() - new Date(releasedAt).getTime()) / 2_629_800_000);
  let score = deckCount <= 25 ? 99 : deckCount <= 50 ? 96 : deckCount <= 100 ? 92 : deckCount <= 250 ? 84 : deckCount <= 500 ? 74 : deckCount <= 1000 ? 62 : 45;
  if (ageMonths < 12) score -= Math.round((12 - ageMonths) * 2.2);
  if (ageMonths > 60) score += 3;
  return Math.max(20, Math.min(99, score));
}

function signatureCard(item) {
  const id = String(item.id ?? "");
  const name = String(item.name ?? "");
  if (!id || !name) return null;
  return {
    id,
    name,
    imageUrl: `https://cards.scryfall.io/art_crop/front/${id[0]}/${id[1]}/${id}.jpg`,
    scryfallUrl: `https://scryfall.com/search?q=${encodeURIComponent(`!\"${name}\"`)}`,
  };
}

async function candidates() {
  const url = new URL("https://api.scryfall.com/cards/search");
  url.searchParams.set("q", "is:commander f:commander game:paper");
  url.searchParams.set("order", "edhrec");
  url.searchParams.set("dir", "desc");
  url.searchParams.set("unique", "cards");
  let page = await fetchJson(url);
  const cards = [];
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    if (Array.isArray(page.data)) cards.push(...page.data.map(record));
    if (!page.has_more || !page.next_page || pageNumber === 9) break;
    await wait(130);
    page = await fetchJson(String(page.next_page));
  }
  const cutoff = Date.now() - 150 * 86_400_000;
  return cards
    .filter((card) => oracleText(card).length >= 45 && imageUris(card).normal && Number(card.edhrec_rank ?? 0) > 0 && new Date(String(card.released_at ?? 0)).getTime() < cutoff)
    .map((card, index) => {
      const year = new Date(String(card.released_at ?? 0)).getUTCFullYear();
      const modern = year >= 2017 ? 10 : year >= 2008 ? 5 : 0;
      const variety = ((index * 7919 + String(card.id).charCodeAt(0) * 104729) % 1200) / 100;
      return { card, score: mechanicalInterest(oracleText(card)) + modern + variety };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 190)
    .map((entry) => entry.card);
}

async function enrich(card) {
  try {
    const name = String(card.name ?? "").split(" // ")[0];
    const edhrec = await fetchJson(`https://json.edhrec.com/pages/commanders/${slugify(name)}.json`);
    const json = record(record(edhrec.container).json_dict);
    const commander = record(json.card);
    const deckCount = Number(commander.num_decks ?? 0);
    if (!deckCount || deckCount > 1500) return null;
    const tags = Object.entries(record(edhrec.tag_counts)).sort((a, b) => Number(b[1]) - Number(a[1])).map(([tag]) => tag);
    const lists = Array.isArray(json.cardlists) ? json.cardlists.map(record) : [];
    const highSynergy = lists.find((list) => list.tag === "highsynergycards");
    const signatures = (Array.isArray(highSynergy?.cardviews) ? highSynergy.cardviews : []).slice(0, 3).map((item) => signatureCard(record(item))).filter(Boolean);
    const images = imageUris(card);
    const text = oracleText(card);
    const themes = deriveThemes(card, tags);
    const priceValue = record(card.prices).usd ? Number(record(card.prices).usd) : null;
    return {
      id: String(card.id ?? name), name, manaCost: manaCost(card), manaValue: Number(card.cmc ?? 0),
      typeLine: String(card.type_line ?? "Legendary Creature"), oracleText: text,
      colorIdentity: Array.isArray(card.color_identity) ? card.color_identity.map(String) : [],
      imageUrl: String(images.normal ?? images.large ?? ""), artUrl: String(images.art_crop ?? images.normal ?? ""),
      scryfallUrl: String(card.scryfall_uri ?? "https://scryfall.com"), releasedAt: String(card.released_at ?? ""),
      setName: String(card.set_name ?? ""), edhrecRank: Number(card.edhrec_rank ?? commander.rank ?? 0),
      deckCount, salt: Number(commander.salt ?? 0), price: Number.isFinite(priceValue) ? priceValue : null,
      themes, signatures, obscurityScore: obscurity(deckCount, String(card.released_at ?? "")),
      why: explain(themes, text), caution: warning(deckCount, Number(card.cmc ?? 0), text),
    };
  } catch (error) {
    console.warn(`Skipped ${card.name}: ${error.message}`);
    return null;
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
      await wait(70);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  console.log("Finding underplayed commanders...");
  const [candidateCards, symbolData] = await Promise.all([candidates(), fetchJson("https://api.scryfall.com/symbology")]);
  console.log(`Enriching ${candidateCards.length} candidates with popularity data...`);
  const enriched = await mapLimit(candidateCards, 5, enrich);
  const cards = enriched.filter(Boolean).map((card) => {
    const sweetSpot = card.deckCount >= 60 && card.deckCount <= 900 ? 12 : card.deckCount < 30 ? -12 : 0;
    return { card, score: card.obscurityScore + mechanicalInterest(card.oracleText) + sweetSpot + Math.min(6, card.themes.length) };
  }).sort((a, b) => b.score - a.score || a.card.deckCount - b.card.deckCount).slice(0, 150).map((entry) => entry.card);
  const symbols = {};
  for (const item of Array.isArray(symbolData.data) ? symbolData.data.map(record) : []) {
    if (item.symbol && item.svg_uri) symbols[String(item.symbol)] = String(item.svg_uri);
  }
  await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
  await writeFile(new URL("../public/data/commanders.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), cards, symbols }));
  console.log(`Wrote ${cards.length} commanders.`);
}

await main();
