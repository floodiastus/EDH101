import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { castCommunityVote, communityConfigured, fetchCommunityShitlist, type CommunityShitlistRow } from "./community";
import { SoundEngine, type SoundEffect } from "./sound";
import "./styles.css";

type SignatureCard = {
  id: string;
  name: string;
  imageUrl: string;
  scryfallUrl: string;
};

type CommanderCard = {
  id: string;
  name: string;
  manaCost: string;
  manaValue: number;
  typeLine: string;
  oracleText: string;
  colorIdentity: string[];
  imageUrl: string;
  artUrl: string;
  scryfallUrl: string;
  releasedAt: string;
  setName: string;
  edhrecRank: number;
  popularityRank: number;
  deckCount: number | null;
  salt: number;
  price: number | null;
  themes: string[];
  tribes?: string[];
  signatures: SignatureCard[];
  why: string;
  caution: string;
  challengePick: boolean;
  challengeReason: string;
};

type View = "discover" | "shortlist" | "shitlist";
type Complexity = "any" | "clean" | "layered" | "crunchy";
type Reaction = "pass" | "love";

const PACK_SIZE = 5;
const POPULARITY_MIN = 100;
const POPULARITY_MAX = 3000;
const POPULARITY_STEP = 100;

const COLORS = [
  { key: "W", label: "White" },
  { key: "U", label: "Blue" },
  { key: "B", label: "Black" },
  { key: "R", label: "Red" },
  { key: "G", label: "Green" },
  { key: "C", label: "Colorless" },
];

const THEME_SEARCHES: Record<string, string> = {
  "+1/+1 Counters": 'o:"+1/+1 counter"',
  Aristocrats: "o:sacrifice",
  Artifacts: "t:artifact",
  Auras: "t:aura",
  Blink: "o:exile o:return o:battlefield",
  "Card Draw": "o:draw",
  Clones: 'o:"a copy"',
  Clues: "(o:clue or o:investigate)",
  Control: 'o:"counter target"',
  Counters: '(o:"a counter" or o:counters or kw:proliferate)',
  Discard: "o:discard",
  Enchantress: "t:enchantment",
  Equipment: "t:equipment",
  "Extra Combats": 'o:"additional combat"',
  "Extra Turns": 'o:"extra turn"',
  Food: "o:food",
  Graveyard: "o:graveyard",
  Landfall: '(kw:landfall or o:"land enters")',
  Lands: "t:land",
  Lifedrain: "o:loses o:life",
  Lifegain: 'o:"gain life"',
  Mill: "o:mill",
  Planeswalkers: "t:planeswalker",
  Politics: "(o:goad or o:monarch or o:vote)",
  Reanimator: 'o:"from your graveyard" o:"to the battlefield"',
  Sacrifice: "o:sacrifice",
  Spellslinger: "(t:instant or t:sorcery)",
  Tokens: "o:create o:token",
  Treasure: "o:treasure",
  Vehicles: "t:vehicle",
  Voltron: "(t:aura or t:equipment)",
  Wheels: "o:discard o:draw",
};

const SEARCH_THEME_PRIORITY = [
  "Clues", "Food", "Treasure", "Vehicles", "Equipment", "Auras", "Planeswalkers",
  "Landfall", "Mill", "Discard", "Sacrifice", "+1/+1 Counters", "Counters", "Reanimator",
  "Lifedrain", "Lifegain", "Blink", "Wheels", "Extra Combats", "Extra Turns",
  "Enchantress", "Voltron", "Artifacts", "Spellslinger", "Graveyard", "Lands",
  "Tokens", "Card Draw", "Control", "Politics",
];

function scryfallType(creatureType: string) {
  return /\s/.test(creatureType) ? `t:"${creatureType.toLowerCase()}"` : `t:${creatureType.toLowerCase()}`;
}

function createdTokenTypes(oracleText: string) {
  const namedTokens = Array.from(oracleText.matchAll(/\btokens?\s+named\s+([A-Z][^"\n.,]*?)(?=\s+(?:with|attached|equal|where|that's)\b|[,.])/g))
    .filter((match) => !/\bcreature\s+$/i.test(oracleText.slice(Math.max(0, (match.index ?? 0) - 24), match.index)))
    .map((match) => match[1].trim());
  const creatureTypes = Array.from(oracleText.matchAll(/\b(?:create|Create)\b[^.!?\n]*?\b((?:[A-Z][a-zA-Z'’-]*)(?:\s+[A-Z][a-zA-Z'’-]*)*)\s+(?:(?:artifact|enchantment|land)\s+)*creature tokens?\b/g),
    (match) => match[1]);

  // Some cards define token types in bullet points after the create instruction.
  if (/create a creature token with those characteristics/i.test(oracleText)) {
    creatureTypes.push(...Array.from(oracleText.matchAll(/•\s+(?:X|\d+\/\d+)\s+(?:[a-z]+\s+)*((?:[A-Z][a-zA-Z'’-]*)(?:\s+[A-Z][a-zA-Z'’-]*)*)\s+with\b/g),
      (match) => match[1]));
  }

  const noncreatureTypes = oracleText
    .split(/[.!?\n]/)
    .filter((clause) => /\bcreate\b/i.test(clause))
    .flatMap((clause) => Array.from(clause.matchAll(/\b((?:[A-Z][a-zA-Z'’-]*)(?:\s+[A-Z][a-zA-Z'’-]*)*)\s+(?:(?:artifact|enchantment)\s+)*tokens?\b/g),
      (match) => match[1].replace(/^X\s+/, "")))
    .filter((type) => !["This", "That", "Those", "X"].includes(type));

  return [...new Set([...namedTokens, ...creatureTypes, ...noncreatureTypes])];
}

function tokenTypeSearch(creatureType: string) {
  const oracleType = creatureType.toLowerCase().replace(/"/g, '\\"');
  return `(${scryfallType(creatureType)} or o:"${oracleType}")`;
}

function edhrecCommanderUrl(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://edhrec.com/commanders/${slug}`;
}

function deckSearches(card: CommanderCard) {
  const tribes = card.tribes ?? [];
  const createdTypes = createdTokenTypes(card.oracleText);
  const identity = card.colorIdentity.length ? card.colorIdentity.join("").toLowerCase() : "c";
  const orderedThemes = [
    ...SEARCH_THEME_PRIORITY.filter((theme) => card.themes.includes(theme)),
    ...card.themes.filter((theme) => THEME_SEARCHES[theme] && !SEARCH_THEME_PRIORITY.includes(theme)),
  ].filter((theme) => theme !== "Tokens" || createdTypes.length === 0);
  const focuses = [
    ...createdTypes.map((creatureType) => ({ label: creatureType, query: tokenTypeSearch(creatureType) })),
    ...tribes.map((tribe) => ({ label: tribe, query: scryfallType(tribe) })),
    ...orderedThemes.map((theme) => ({ label: theme, query: THEME_SEARCHES[theme] })),
  ];
  const seen = new Set<string>();

  return focuses.flatMap(({ label, query }) => {
    if (!query || seen.has(query)) return [];
    seen.add(query);
    const search = `${query} id<=${identity} legal:commander game:paper`;
    const params = new URLSearchParams({ q: search, unique: "cards", as: "grid", order: "edhrec" });
    return [{ label, url: `https://scryfall.com/search?${params.toString()}` }];
  }).slice(0, 4);
}

function complexity(card: CommanderCard) {
  const length = card.oracleText.length;
  const clauses = (card.oracleText.match(/[,:;—]/g) ?? []).length;
  if (length < 190 && clauses < 5) return "clean";
  if (length > 360 || clauses > 11) return "crunchy";
  return "layered";
}

function money(value: number | null) {
  return value === null ? "—" : "$" + value.toFixed(value < 10 ? 2 : 0);
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  const randomValues = new Uint32Array(Math.max(0, result.length - 1));
  window.crypto.getRandomValues(randomValues);
  for (let index = result.length - 1; index > 0; index--) {
    const swap = randomValues[index - 1] % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function randomUnit() {
  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);
  return value[0] / 0x100000000;
}

function weightedSample<T>(items: T[], count: number, weightFor: (item: T) => number) {
  const pool = [...items];
  const picked: T[] = [];
  while (pool.length && picked.length < count) {
    const weights = pool.map((item) => Math.max(0.01, weightFor(item)));
    let roll = randomUnit() * weights.reduce((sum, weight) => sum + weight, 0);
    let pickedIndex = weights.length - 1;
    for (let index = 0; index < weights.length; index++) {
      roll -= weights[index];
      if (roll <= 0) {
        pickedIndex = index;
        break;
      }
    }
    picked.push(pool.splice(pickedIndex, 1)[0]);
  }
  return picked;
}

function ManaSymbol({ symbol, symbols, className = "" }: { symbol: string; symbols: Record<string, string>; className?: string }) {
  const uri = symbols?.[symbol];
  return uri
    ? <img className={"mana-symbol " + className} src={uri} alt={symbol} title={symbol} referrerPolicy="no-referrer" />
    : <i className={"mana-fallback " + className}>{symbol.replace(/[{}]/g, "")}</i>;
}

function OracleText({ text, symbols }: { text: string; symbols: Record<string, string> }) {
  const parts = text.split(/(\{[^}]+\})/g).filter(Boolean);
  return <p className="oracle-text">{parts.map((part, index) => /^\{[^}]+\}$/.test(part)
    ? <ManaSymbol key={part + index} symbol={part} symbols={symbols} className="oracle-symbol" />
    : part
  )}</p>;
}

export default function Home() {
  const [cards, setCards] = useState<CommanderCard[]>([]);
  const [symbols, setSymbols] = useState<Record<string, string>>({});
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [popularityStart, setPopularityStart] = useState(100);
  const [popularityEnd, setPopularityEnd] = useState(500);
  const [theme, setTheme] = useState("Any theme");
  const [complexityFilter, setComplexityFilter] = useState<Complexity>("any");
  const [showChallengePicks, setShowChallengePicks] = useState(false);
  const [showShitlisted, setShowShitlisted] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [packIds, setPackIds] = useState<string[]>([]);
  const [packTotal, setPackTotal] = useState(PACK_SIZE);
  const [packOpened, setPackOpened] = useState(false);
  const [packOpening, setPackOpening] = useState(false);
  const [shortlist, setShortlist] = useState<CommanderCard[]>([]);
  const [view, setView] = useState<View>("discover");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [communityRows, setCommunityRows] = useState<CommunityShitlistRow[]>([]);
  const [communityLoading, setCommunityLoading] = useState(communityConfigured);
  const [communityError, setCommunityError] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exitDirection, setExitDirection] = useState<-1 | 0 | 1>(0);
  const [soundEnabled, setSoundEnabled] = useState(() => window.localStorage.getItem("deep-cuts-sound") !== "off");
  const swipeOrigin = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const swipeTimer = useRef<number | null>(null);
  const sound = useRef<SoundEngine | null>(null);

  if (sound.current === null) sound.current = new SoundEngine();

  function playSound(effect: SoundEffect) {
    sound.current?.play(effect);
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("deep-cuts-taste");
      if (saved) {
        const data = JSON.parse(saved) as { shortlist?: CommanderCard[]; seen?: string[] };
        setShortlist((data.shortlist ?? []).map((card) => ({
          ...card,
          tribes: Array.isArray(card.tribes) ? card.tribes : [],
          signatures: Array.isArray(card.signatures) ? card.signatures.filter((item) => typeof item === "object" && item !== null) : [],
        })));
        setSeen(Array.isArray(data.seen) ? data.seen.filter((id) => typeof id === "string") : []);
      }
    } catch {}
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("deep-cuts-taste", JSON.stringify({ shortlist, seen }));
  }, [shortlist, seen, storageReady]);

  useEffect(() => {
    void loadCommanders();
    void loadCommunityShitlist();
  }, []);

  useEffect(() => () => {
    if (swipeTimer.current !== null) window.clearTimeout(swipeTimer.current);
    sound.current?.close();
  }, []);

  useEffect(() => {
    sound.current?.setEnabled(soundEnabled);
    window.localStorage.setItem("deep-cuts-sound", soundEnabled ? "on" : "off");
  }, [soundEnabled]);

  async function loadCommunityShitlist() {
    if (!communityConfigured) {
      setCommunityLoading(false);
      return;
    }
    setCommunityLoading(true);
    setCommunityError("");
    try {
      setCommunityRows(await fetchCommunityShitlist());
    } catch (communityLoadError) {
      setCommunityError(communityLoadError instanceof Error ? communityLoadError.message : "Community votes are unavailable.");
    } finally {
      setCommunityLoading(false);
    }
  }

  async function loadCommanders() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(import.meta.env.BASE_URL + "data/commanders.json");
      const result = await response.json() as { cards?: CommanderCard[]; symbols?: Record<string, string>; error?: string };
      if (!response.ok || !result.cards?.length) throw new Error(result.error ?? "No commanders found.");
      const nextCards = shuffled(result.cards);
      const cardsById = new Map(nextCards.map((card) => [card.id, card]));
      setCards(nextCards);
      setShortlist((items) => items.map((card) => cardsById.get(card.id) ?? card));
      setSymbols(result.symbols ?? {});
      setPackIds([]);
      setPackOpened(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Commander discovery failed.");
    } finally {
      setLoading(false);
    }
  }

  const themes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of cards) {
      if (!showChallengePicks && card.challengePick) continue;
      for (const item of card.themes) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return ["Any theme", ...Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([item]) => item)];
  }, [cards, showChallengePicks]);

  const recommendedTotal = useMemo(() => cards.filter((card) => !card.challengePick).length, [cards]);
  const taste = useMemo(() => {
    const likedThemes: Record<string, number> = {};
    for (const card of shortlist) {
      for (const item of card.themes) likedThemes[item] = (likedThemes[item] ?? 0) + 1;
    }
    return likedThemes;
  }, [shortlist]);
  const shitlistedIds = useMemo(() => new Set(communityRows.map((row) => row.cardId)), [communityRows]);
  const shitlistCards = useMemo(() => communityRows
    .map((row) => ({ row, card: cards.find((card) => card.id === row.cardId) }))
    .filter((entry): entry is { row: CommunityShitlistRow; card: CommanderCard } => Boolean(entry.card)),
  [communityRows, cards]);

  const eligible = useMemo(() => cards
    .filter((card) => {
      if (!selectedColors.length) return true;
      const selected = [...selectedColors].sort().join("");
      const identity = [...card.colorIdentity].sort().join("") || "C";
      return selected === identity;
    })
    .filter((card) => card.popularityRank >= popularityStart && card.popularityRank <= popularityEnd)
    .filter((card) => showChallengePicks || !card.challengePick)
    .filter((card) => showShitlisted || !shitlistedIds.has(card.id))
    .filter((card) => theme === "Any theme" || card.themes.includes(theme))
    .filter((card) => complexityFilter === "any" || complexity(card) === complexityFilter),
  [cards, selectedColors, popularityStart, popularityEnd, showChallengePicks, showShitlisted, shitlistedIds, theme, complexityFilter]);

  const packCards = useMemo(() => packIds
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is CommanderCard => Boolean(card)),
  [packIds, cards]);
  const current = packCards[0] ?? null;

  const availableForPack = useMemo(() => eligible.filter((card) => !seen.includes(card.id)), [eligible, seen]);
  const packPosition = current ? packTotal - packCards.length + 1 : packTotal;
  const currentStackDepth = Math.max(0, packTotal - packCards.length);

  function toggleColor(color: string) {
    setSelectedColors((currentColors) => {
      if (color === "C") return currentColors.includes("C") ? [] : ["C"];
      const withoutColorless = currentColors.filter((item) => item !== "C");
      return withoutColorless.includes(color) ? withoutColorless.filter((item) => item !== color) : [...withoutColorless, color];
    });
  }

  function commitReaction(card: CommanderCard, reaction: Reaction) {
    setSeen((items) => items.includes(card.id) ? items : [...items, card.id]);
    setPackIds((items) => items.filter((id) => id !== card.id));
    if (reaction === "love") {
      setShortlist((items) => items.some((item) => item.id === card.id) ? items : [...items, card]);
    } else {
      setShortlist((items) => items.filter((item) => item.id !== card.id));
    }
    if (communityConfigured) {
      void castCommunityVote(card.id, reaction)
        .then((submitted) => {
          if (submitted && reaction === "pass") void loadCommunityShitlist();
        })
        .catch((voteError) => setCommunityError(voteError instanceof Error ? voteError.message : "Your community vote could not be saved."));
    }
  }

  function reactTo(card: CommanderCard, reaction: Reaction, releaseY = 0) {
    if (swipeTimer.current !== null) return;
    const reactionScrollY = window.scrollY;
    const preserveDesktopScroll = window.matchMedia("(min-width: 681px)").matches;
    const direction = reaction === "pass" ? -1 : 1;
    playSound(reaction === "pass" ? "swipe-left" : "swipe-right");
    const exitDistance = Math.max(window.innerWidth, 700) + 420;
    setExitDirection(direction);
    setDrag({ x: direction * exitDistance, y: Math.max(-180, Math.min(180, releaseY * 1.35)), active: false });
    swipeTimer.current = window.setTimeout(() => {
      commitReaction(card, reaction);
      const packFinished = packCards.length === 1;
      playSound(packFinished ? "complete" : "reveal");
      if (packFinished) setPackOpened(false);
      setDrag({ x: 0, y: 0, active: false });
      setExitDirection(0);
      swipeTimer.current = null;
      if (!packFinished && preserveDesktopScroll) window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const root = document.documentElement;
        const previousScrollBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(0, reactionScrollY);
        root.style.scrollBehavior = previousScrollBehavior;
      }));
    }, 280);
  }

  function selectCard(card: CommanderCard) {
    playSound("reveal");
    setPackIds([card.id]);
    setPackTotal(1);
    setPackOpened(true);
    setView("discover");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dealNewStack() {
    playSound("select");
    setCards((items) => shuffled(items));
    setSeen((items) => [...new Set([...items, ...packIds])]);
    setPackIds([]);
    setPackTotal(PACK_SIZE);
    setPackOpened(false);
    setPackOpening(false);
  }

  function restartDiscovery() {
    playSound("select");
    setCards((items) => shuffled(items));
    setSeen([]);
    setPackIds([]);
    setPackTotal(PACK_SIZE);
    setPackOpened(false);
    setPackOpening(false);
  }

  function openBooster() {
    if (packOpening || !availableForPack.length) return;
    playSound("pack");
    const nextPack = weightedSample(availableForPack, PACK_SIZE, (card) => {
      const affinity = card.themes.reduce((sum, item) => sum + (taste[item] ?? 0), 0);
      return 1 + Math.min(5, affinity * 0.65);
    });
    setPackIds(nextPack.map((card) => card.id));
    setPackTotal(nextPack.length);
    setPackOpening(true);
    window.setTimeout(() => {
      setPackOpened(true);
      setPackOpening(false);
      playSound("reveal");
    }, 1150);
  }

  function resetFilters() {
    setSelectedColors([]);
    setPopularityStart(100);
    setPopularityEnd(500);
    setTheme("Any theme");
    setComplexityFilter("any");
    setShowChallengePicks(false);
    setShowShitlisted(false);
    setPackIds([]);
    setPackTotal(PACK_SIZE);
    setPackOpened(false);
    setPackOpening(false);
  }

  function resetProfile() {
    if (!window.confirm("Reset all likes and seen-card history?")) return;
    playSound("select");
    window.localStorage.removeItem("deep-cuts-taste");
    setShortlist([]);
    setSeen([]);
    setPackIds([]);
    setPackTotal(PACK_SIZE);
    setPackOpened(false);
    setPackOpening(false);
  }

  function applyFilters() {
    if (swipeTimer.current !== null) {
      window.clearTimeout(swipeTimer.current);
      swipeTimer.current = null;
    }
    swipeOrigin.current = null;
    setDrag({ x: 0, y: 0, active: false });
    setExitDirection(0);
    setPackIds([]);
    setPackTotal(PACK_SIZE);
    setPackOpened(false);
    setPackOpening(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || event.repeat || target.closest("input, select, textarea, [contenteditable='true']")) return;

      if (current && exitDirection === 0 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        reactTo(current, event.key === "ArrowLeft" ? "pass" : "love");
        return;
      }

      if (event.code === "Space" && !packOpened && !packOpening && availableForPack.length && !target.closest("button, a, summary")) {
        event.preventDefault();
        openBooster();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [current, exitDirection, packOpened, packOpening, availableForPack.length]);

  function beginSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (swipeTimer.current !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    swipeOrigin.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    playSound("pickup");
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  }

  function moveSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = swipeOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    setDrag({ x: event.clientX - origin.x, y: event.clientY - origin.y, active: true });
  }

  function cancelSwipe() {
    swipeOrigin.current = null;
    if (swipeTimer.current === null) setDrag({ x: 0, y: 0, active: false });
  }

  function finishSwipe(event: ReactPointerEvent<HTMLDivElement>, card: CommanderCard) {
    const origin = swipeOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const x = event.clientX - origin.x;
    const y = event.clientY - origin.y;
    swipeOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (x <= -72) reactTo(card, "pass", y);
    else if (x >= 72) reactTo(card, "love", y);
    else {
      playSound("cancel");
      setDrag({ x: 0, y: 0, active: false });
    }
  }

  const swipeIntent = drag.x < -38 ? "reject" : drag.x > 38 ? "save" : "";
  const currentDeckSearches = current ? deckSearches(current) : [];
  const baseCardX = currentStackDepth * 8;
  const baseCardY = currentStackDepth * -7;
  const baseCardAngle = (currentStackDepth - 2) * 1.35;
  const baseCardScale = 1 - currentStackDepth * .009;
  const swipeCardStyle: CSSProperties = exitDirection
    ? {
      transform: `translate3d(${baseCardX + drag.x}px, ${baseCardY + drag.y}px, 0) rotate(${baseCardAngle + exitDirection * 18}deg) scale(${baseCardScale})`,
      transition: "transform 280ms cubic-bezier(.18,.74,.25,1)",
    }
    : drag.active
      ? { transform: `translate3d(${baseCardX + drag.x}px, ${baseCardY + drag.y}px, 0) rotate(${baseCardAngle + drag.x / 24}deg) scale(${baseCardScale})`, transition: "none" }
      : { transform: `translate3d(${baseCardX}px, ${baseCardY}px, 0) rotate(${baseCardAngle}deg) scale(${baseCardScale})` };

  return (
    <main
      onClick={(event) => {
        const target = event.target as HTMLElement;
        const control = target.closest("button:not(:disabled), a, summary");
        if (control && !control.closest(".swipe-card") && !control.hasAttribute("data-primary-sfx")) playSound("tap");
      }}
      onChange={(event) => {
        if ((event.target as HTMLElement).matches("input, select")) playSound("select");
      }}
    >
      <header className="site-header">
        <button className="wordmark" onClick={() => setView("discover")} aria-label="Deep Cuts discovery">
          <span>DC</span><strong>Deep Cuts</strong>
        </button>
        <div className="header-actions">
          <button className="sound-toggle" aria-pressed={soundEnabled} onClick={() => setSoundEnabled((enabled) => !enabled)} aria-label={soundEnabled ? "Mute sound effects" : "Turn on sound effects"}>
            <span aria-hidden="true">{soundEnabled ? "♪" : "×"}</span> SFX
          </button>
          <button className={view === "shortlist" ? "shortlist-link active" : "shortlist-link"} onClick={() => setView("shortlist")}>
            Liked <b>{shortlist.length}</b>
          </button>
          {communityConfigured && <button className={view === "shitlist" ? "shitlist-link active" : "shitlist-link"} onClick={() => { setView("shitlist"); void loadCommunityShitlist(); }}>
            Shit List <b>{communityRows.length}</b>
          </button>}
          <button className="shuffle-button" data-primary-sfx onClick={dealNewStack} aria-label="Start a new booster"><span>✦</span> New pack</button>
        </div>
      </header>

      {view === "discover" && <section className="discover-page">
        <details className="filters-panel">
          <summary><span>Filters</span><small>{eligible.length.toLocaleString()} matches</small><i aria-hidden="true">+</i></summary>
          <div className="filter-grid">
            <fieldset className="color-control">
              <legend>Color identity</legend>
              <div className="color-filter">
                {COLORS.map((color) => <button key={color.key} className={selectedColors.includes(color.key) ? "selected" : ""} onClick={() => toggleColor(color.key)} aria-label={color.label}><ManaSymbol symbol={`{${color.key}}`} symbols={symbols} /></button>)}
              </div>
            </fieldset>
            <div className="filter-control popularity-control">
              <span>Popularity rank <output>#{popularityStart.toLocaleString()}–#{popularityEnd.toLocaleString()}</output></span>
              <div
                className="popularity-range"
                style={{
                  "--range-start": `${((popularityStart - POPULARITY_MIN) / (POPULARITY_MAX - POPULARITY_MIN)) * 100}%`,
                  "--range-end": `${((popularityEnd - POPULARITY_MIN) / (POPULARITY_MAX - POPULARITY_MIN)) * 100}%`,
                } as CSSProperties}
              >
                <input aria-label="Most popular rank" type="range" min={POPULARITY_MIN} max={popularityEnd - POPULARITY_STEP} step={POPULARITY_STEP} value={popularityStart} onChange={(event) => setPopularityStart(Number(event.target.value))} />
                <input aria-label="Most obscure rank" type="range" min={popularityStart + POPULARITY_STEP} max={POPULARITY_MAX} step={POPULARITY_STEP} value={popularityEnd} onChange={(event) => setPopularityEnd(Number(event.target.value))} />
              </div>
            </div>
            <label className="filter-control" htmlFor="complexity"><span>Rules text</span><select id="complexity" value={complexityFilter} onChange={(event) => setComplexityFilter(event.target.value as Complexity)}><option value="any">Any complexity</option><option value="clean">Clean</option><option value="layered">Layered</option><option value="crunchy">Crunchy</option></select></label>
            <label className="filter-control" htmlFor="theme"><span>Theme</span><select id="theme" value={theme} onChange={(event) => setTheme(event.target.value)}>{themes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="challenge-toggle"><input type="checkbox" checked={showChallengePicks} onChange={(event) => setShowChallengePicks(event.target.checked)} /><span>Include challenge picks <small>+{Math.max(0, cards.length - recommendedTotal).toLocaleString()}</small></span></label>
            {communityRows.length > 0 && <label className="challenge-toggle"><input type="checkbox" checked={showShitlisted} onChange={(event) => setShowShitlisted(event.target.checked)} /><span>Include community rejects <small>+{communityRows.length}</small></span></label>}
            <div className="filter-actions">
              <button className="apply-filters" onClick={(event) => { applyFilters(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Apply &amp; new pack</button>
              <button className="reset-filters" onClick={resetFilters}>Reset</button>
            </div>
          </div>
        </details>

        <section className={"discovery-stage " + (!packOpened ? "pack-opening-stage" : "")}>
          {loading ? <div className="loading-stage"><Skeleton height="62vh" borderRadius={12} baseColor="#211f1a" highlightColor="#353126" /><p>Loading commanders…</p></div>
            : error ? <div className="empty-stage"><h1>Couldn’t load commanders.</h1><p>{error}</p><button onClick={loadCommanders}>Try again</button></div>
              : !packOpened ? <div className="booster-bay">
                <div className="booster-card-column">
                  <div className="pack-status pack-status-placeholder" aria-hidden="true">
                    <span>Pack 1/{PACK_SIZE}</span>
                    <div className="pack-pips">{Array.from({ length: PACK_SIZE }, (_, index) => <i key={index} className={index === 0 ? "current" : ""} />)}</div>
                  </div>
                  <div className={"booster-visual " + (packOpening ? "opening" : "")}>
                    <div className="booster-understack" aria-hidden="true">
                      {packCards.slice(0, PACK_SIZE).reverse().map((card, reverseIndex) => {
                        const depth = packCards.length - 1 - reverseIndex;
                        return <img key={card.id} src={card.imageUrl} alt="" referrerPolicy="no-referrer" style={{ "--preview-depth": depth } as CSSProperties} />;
                      })}
                    </div>
                    <button className="booster-pack" data-primary-sfx onClick={availableForPack.length ? openBooster : restartDiscovery} disabled={packOpening} aria-label={availableForPack.length ? "Open a five-card commander booster" : "Reset seen commanders and start over"}>
                      {["top", "bottom"].map((half) => <span className={`foil-face foil-${half}`} key={half} aria-hidden="true">
                        <span className="foil-glint" />
                        <span className="pack-crimp top" />
                        <span className="pack-mark">DC</span>
                        <span className="pack-title">Deep<br />Cuts</span>
                        <span className="pack-subtitle">Commander discovery</span>
                        <span className="pack-count">{Math.min(PACK_SIZE, availableForPack.length)} cards</span>
                        <span className="pack-crimp bottom" />
                      </span>)}
                      <span className="tear-edge" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="swipe-hint booster-hint-placeholder" aria-hidden="true"><span>← Reject</span><span>Like →</span></p>
                </div>
                <div className="booster-copy">
                  <span className="eyebrow">{availableForPack.length ? `${Math.min(PACK_SIZE, availableForPack.length)} card booster` : "All matches seen"}</span>
                  <h1>{availableForPack.length ? "Rip. Reveal. Swipe." : "Fresh shuffle?"}</h1>
                  <button className="open-pack-button" data-primary-sfx onClick={availableForPack.length ? openBooster : restartDiscovery} disabled={packOpening}>
                    {packOpening ? "Ripping…" : availableForPack.length ? "Rip it open" : "Start over"}
                  </button>
                </div>
              </div>
                : current ? <>
                <div className="art-backdrop" style={{ backgroundImage: "url(" + current.artUrl + ")" }} />
                <div className="card-column">
                  <div className="pack-status" aria-label={`Card ${packPosition} of ${packTotal}`}>
                    <span>Pack {packPosition}/{packTotal}</span>
                    <div className="pack-pips" aria-hidden="true">{Array.from({ length: packTotal }, (_, index) => <i key={index} className={index < packPosition - 1 ? "judged" : index === packPosition - 1 ? "current" : ""} />)}</div>
                  </div>
                  <div className="card-stack">
                    {packCards.slice(1).reverse().map((card, reverseIndex) => {
                      const depth = currentStackDepth + packCards.length - 1 - reverseIndex;
                      return <div className="stack-card" key={card.id} style={{ "--stack-depth": depth } as CSSProperties} aria-hidden="true">
                        <img src={card.imageUrl} alt="" draggable="false" referrerPolicy="no-referrer" />
                      </div>;
                    })}
                  <div
                    className="swipe-card"
                    key={current.id}
                    data-intent={swipeIntent}
                    data-dragging={drag.active ? "true" : undefined}
                    data-exiting={exitDirection ? "true" : undefined}
                    data-promoted={currentStackDepth ? "true" : undefined}
                    onPointerDown={beginSwipe}
                    onPointerMove={moveSwipe}
                    onPointerUp={(event) => finishSwipe(event, current)}
                    onPointerCancel={cancelSwipe}
                    style={swipeCardStyle}
                  >
                    <span className="swipe-feedback reject">Reject</span>
                    <span className="swipe-feedback save">Like</span>
                    <a href={current.scryfallUrl} target="_blank" rel="noreferrer" aria-label={"View " + current.name + " on Scryfall"}>
                      <img src={current.imageUrl} alt={current.name} draggable="false" referrerPolicy="no-referrer" style={currentStackDepth ? { filter: `brightness(${1 - currentStackDepth * .06})` } : undefined} />
                    </a>
                  </div>
                  </div>
                  <div className="reaction-bar" aria-label="Commander reactions">
                    <button className="pass" data-primary-sfx disabled={exitDirection !== 0} onClick={() => reactTo(current, "pass")}><span>←</span> Reject</button>
                    <button className="love" data-primary-sfx disabled={exitDirection !== 0} onClick={() => reactTo(current, "love")}>Like <span>→</span></button>
                  </div>
                  <p className="swipe-hint"><span>← Reject</span><span>Like →</span></p>
                </div>

                <article className="commander-profile">
                  <div className="profile-scroll">
                  <div className="profile-topline"><span>{current.setName} · {new Date(current.releasedAt).getFullYear()}</span>{current.challengePick && <em>Challenge</em>}</div>
                  <div className="commander-title"><h1>{current.name}</h1></div>
                  <p className="type-line">{current.typeLine}</p>
                  <OracleText text={current.oracleText} symbols={symbols} />

                  <div className="card-meta">
                    <span><strong>#{current.popularityRank.toLocaleString()}</strong> popularity</span>
                    {current.deckCount !== null && <span><strong>{current.deckCount.toLocaleString()}</strong> decks</span>}
                    <span><strong>{money(current.price)}</strong> market</span>
                  </div>

                  {current.challengePick && <p className="challenge-note">{current.challengeReason}</p>}
                  {current.themes.length > 0 && <div className="theme-chips">{current.themes.slice(0, 4).map((item) => <button key={item} onClick={() => setTheme(item)}>{item}</button>)}</div>}
                  <div className="external-links">
                    {currentDeckSearches.length > 0 && <div className="scryfall-searches">
                      <span>Explore on Scryfall</span>
                      <div className="scryfall-search-grid">{currentDeckSearches.map((search) => <a key={search.label} className="scryfall-search-link" href={search.url} target="_blank" rel="noreferrer" aria-label={`Find ${search.label} cards on Scryfall`}>
                        <strong>{search.label}</strong><b aria-hidden="true">↗</b>
                      </a>)}</div>
                    </div>}
                    <a className="deck-search-link" href={edhrecCommanderUrl(current.name)} target="_blank" rel="noreferrer" aria-label={`View ${current.name} on EDHREC`}>
                      <strong>View commander on EDHREC</strong><b aria-hidden="true">↗</b>
                    </a>
                  </div>
                  </div>
                </article>
              </>
                : null}
        </section>
      </section>}

      {view === "shortlist" && <section className="shortlist-page">
        <div className="shortlist-heading">
          <button onClick={() => setView("discover")}>← Discover</button>
          <h1>Liked commanders</h1>
          <div className="shortlist-summary">
            <p>Your profile: {shortlist.length} liked · {seen.length} rated. Likes gently weight future packs toward shared themes.</p>
            {(shortlist.length > 0 || seen.length > 0) && <button className="clear-pool" onClick={resetProfile}>Reset profile</button>}
          </div>
        </div>
        {shortlist.length ? <div className="liked-grid">{shortlist.map((card) =>
          <button key={card.id} className="liked-card" onClick={() => selectCard(card)} aria-label={`Open ${card.name}`}>
            <img src={card.imageUrl} alt={card.name} loading="lazy" referrerPolicy="no-referrer" />
          </button>
        )}</div>
          : <div className="empty-shortlist"><h2>No likes yet.</h2><p>Swipe right or tap Like on a commander.</p><button onClick={() => setView("discover")}>Discover commanders</button></div>}
      </section>}

      {view === "shitlist" && <section className="shortlist-page shitlist-page">
        <div className="shortlist-heading">
          <button onClick={() => setView("discover")}>← Discover</button>
          <h1>Community Shit List</h1>
          <p>Hidden from discovery after 25+ votes and a 70%+ rejection rate.</p>
        </div>
        {!communityConfigured ? <div className="community-state"><h2>Database connection pending.</h2><p>The shared voting UI is ready; Supabase still needs to be connected to this build.</p></div>
          : communityLoading ? <div className="community-state"><Skeleton height={180} borderRadius={8} baseColor="#211f1a" highlightColor="#353126" /></div>
            : communityError ? <div className="community-state"><h2>Community votes are unavailable.</h2><p>{communityError}</p><button onClick={loadCommunityShitlist}>Try again</button></div>
              : shitlistCards.length ? <div className="shortlist-grid">{shitlistCards.map(({ card, row }) => <article key={card.id} className="saved-card shitlisted-card">
                <button className="saved-image" onClick={() => { setShowShitlisted(true); selectCard(card); }}><img src={card.imageUrl} alt={card.name} loading="lazy" referrerPolicy="no-referrer" /></button>
                <div className="saved-copy">
                  <div><strong className="reject-rate">{row.rejectionRate}% rejected</strong></div>
                  <button className="saved-name" onClick={() => { setShowShitlisted(true); selectCard(card); }}>{card.name}</button>
                  <p>{row.rejects} rejects · {row.totalVotes} total votes</p>
                </div>
              </article>)}</div>
                : <div className="empty-shortlist"><h2>Nobody qualifies yet.</h2><p>Commanders appear here only after enough community reactions.</p><button onClick={() => setView("discover")}>Start voting</button></div>}
      </section>}

    </main>
  );
}
