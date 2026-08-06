import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
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
  signatures: SignatureCard[];
  obscurityScore: number;
  why: string;
  caution: string;
  challengePick: boolean;
  challengeReason: string;
};

type View = "discover" | "shortlist";
type Complexity = "any" | "clean" | "layered" | "crunchy";
type Reaction = "pass" | "intrigue" | "love";

const COLORS = [
  { key: "W", label: "White" },
  { key: "U", label: "Blue" },
  { key: "B", label: "Black" },
  { key: "R", label: "Red" },
  { key: "G", label: "Green" },
  { key: "C", label: "Colorless" },
];

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
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function ManaSymbol({ symbol, symbols, className = "" }: { symbol: string; symbols: Record<string, string>; className?: string }) {
  const uri = symbols?.[symbol];
  return uri
    ? <img className={"mana-symbol " + className} src={uri} alt={symbol} title={symbol} referrerPolicy="no-referrer" />
    : <i className={"mana-fallback " + className}>{symbol.replace(/[{}]/g, "")}</i>;
}

function ManaCost({ cost, symbols }: { cost: string; symbols: Record<string, string> }) {
  const parts = cost.match(/\{[^}]+\}/g) ?? [];
  return <span className="mana-cost" aria-label={"Mana cost " + cost}>{parts.map((symbol, index) => <ManaSymbol key={symbol + index} symbol={symbol} symbols={symbols} />)}</span>;
}

function OracleText({ text, symbols }: { text: string; symbols: Record<string, string> }) {
  const parts = text.split(/(\{[^}]+\})/g).filter(Boolean);
  return <p className="oracle-text">{parts.map((part, index) => /^\{[^}]+\}$/.test(part)
    ? <ManaSymbol key={part + index} symbol={part} symbols={symbols} className="oracle-symbol" />
    : part
  )}</p>;
}

function ColorPips({ colors, symbols }: { colors: string[]; symbols: Record<string, string> }) {
  const pips = colors.length ? colors : ["C"];
  const label = colors.length ? colors : ["Colorless"];
  return <span className="color-pips" aria-label={label.join(", ")}>{pips.map((color) => <ManaSymbol key={color} symbol={`{${color}}`} symbols={symbols} />)}</span>;
}

export default function Home() {
  const [cards, setCards] = useState<CommanderCard[]>([]);
  const [symbols, setSymbols] = useState<Record<string, string>>({});
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [minObscurity, setMinObscurity] = useState(65);
  const [theme, setTheme] = useState("Any theme");
  const [complexityFilter, setComplexityFilter] = useState<Complexity>("any");
  const [showChallengePicks, setShowChallengePicks] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [shortlist, setShortlist] = useState<CommanderCard[]>([]);
  const [taste, setTaste] = useState<Record<string, number>>({});
  const [view, setView] = useState<View>("discover");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const swipeOrigin = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("deep-cuts-taste");
      if (saved) {
        const data = JSON.parse(saved) as { shortlist?: CommanderCard[]; taste?: Record<string, number> };
        setShortlist((data.shortlist ?? []).map((card) => ({
          ...card,
          signatures: Array.isArray(card.signatures) ? card.signatures.filter((item) => typeof item === "object" && item !== null) : [],
        })));
        setTaste(data.taste ?? {});
      }
    } catch {}
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("deep-cuts-taste", JSON.stringify({ shortlist, taste }));
  }, [shortlist, taste, storageReady]);

  useEffect(() => {
    void loadCommanders();
  }, []);

  async function loadCommanders() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(import.meta.env.BASE_URL + "data/commanders.json");
      const result = await response.json() as { cards?: CommanderCard[]; symbols?: Record<string, string>; error?: string };
      if (!response.ok || !result.cards?.length) throw new Error(result.error ?? "No commanders found.");
      const nextCards = shuffled(result.cards);
      setCards(nextCards);
      setSymbols(result.symbols ?? {});
      setSeen([]);
      setActiveId(nextCards[0].id);
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
      .slice(0, 16)
      .map(([item]) => item)];
  }, [cards, showChallengePicks]);

  const recommendedTotal = useMemo(() => cards.filter((card) => !card.challengePick).length, [cards]);

  const ranked = useMemo(() => cards
    .filter((card) => {
      if (!selectedColors.length) return true;
      const selected = [...selectedColors].sort().join("");
      const identity = [...card.colorIdentity].sort().join("") || "C";
      return selected === identity;
    })
    .filter((card) => card.obscurityScore >= minObscurity)
    .filter((card) => showChallengePicks || !card.challengePick)
    .filter((card) => theme === "Any theme" || card.themes.includes(theme))
    .filter((card) => complexityFilter === "any" || complexity(card) === complexityFilter)
    .map((card) => ({ card, score: card.obscurityScore + card.themes.reduce((sum, item) => sum + (taste[item] ?? 0) * 7, 0) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.card),
  [cards, selectedColors, minObscurity, showChallengePicks, theme, complexityFilter, taste]);

  const current = useMemo(
    () => ranked.find((card) => card.id === activeId && !seen.includes(card.id)) ?? ranked.find((card) => !seen.includes(card.id)) ?? null,
    [ranked, activeId, seen],
  );

  function toggleColor(color: string) {
    setSelectedColors((currentColors) => {
      if (color === "C") return currentColors.includes("C") ? [] : ["C"];
      const withoutColorless = currentColors.filter((item) => item !== "C");
      return withoutColorless.includes(color) ? withoutColorless.filter((item) => item !== color) : [...withoutColorless, color];
    });
  }

  function reactTo(card: CommanderCard, reaction: Reaction) {
    setDrag({ x: 0, y: 0, active: false });
    setSeen((items) => items.includes(card.id) ? items : [...items, card.id]);
    setActiveId(null);
    const weight = reaction === "love" ? 2 : reaction === "intrigue" ? 1 : -.25;
    setTaste((currentTaste) => {
      const next = { ...currentTaste };
      for (const item of card.themes) next[item] = (next[item] ?? 0) + weight;
      return next;
    });
    if (reaction === "love") {
      setShortlist((items) => items.some((item) => item.id === card.id) ? items : [...items, card]);
    }
  }

  function selectCard(card: CommanderCard) {
    setSeen((items) => items.filter((id) => id !== card.id));
    setActiveId(card.id);
    setView("discover");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dealNewStack() {
    setCards((items) => shuffled(items));
    setSeen([]);
    setActiveId(null);
  }

  function resetFilters() {
    setSelectedColors([]);
    setMinObscurity(65);
    setTheme("Any theme");
    setComplexityFilter("any");
    setShowChallengePicks(false);
    setSeen([]);
    setActiveId(null);
  }

  function beginSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeOrigin.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
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
    setDrag({ x: 0, y: 0, active: false });
  }

  function finishSwipe(event: ReactPointerEvent<HTMLDivElement>, card: CommanderCard) {
    const origin = swipeOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const x = event.clientX - origin.x;
    const y = event.clientY - origin.y;
    swipeOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (y <= -72 && Math.abs(y) >= Math.abs(x) * .8) reactTo(card, "love");
    else if (x <= -72 && Math.abs(x) >= Math.abs(y) * .8) reactTo(card, "pass");
    else if (x >= 72 && Math.abs(x) >= Math.abs(y) * .8) reactTo(card, "intrigue");
    else setDrag({ x: 0, y: 0, active: false });
  }

  const swipeIntent = drag.y < -38 && Math.abs(drag.y) >= Math.abs(drag.x) * .8
    ? "favorite"
    : drag.x < -38 && Math.abs(drag.x) >= Math.abs(drag.y) * .8
      ? "reject"
      : drag.x > 38 && Math.abs(drag.x) >= Math.abs(drag.y) * .8
        ? "intriguing"
        : "";

  return (
    <main>
      <header className="site-header">
        <button className="wordmark" onClick={() => setView("discover")} aria-label="Deep Cuts discovery">
          <span>DC</span><strong>Deep Cuts</strong>
        </button>
        <div className="header-actions">
          <button className={view === "shortlist" ? "shortlist-link active" : "shortlist-link"} onClick={() => setView("shortlist")}>
            Shortlist <b>{shortlist.length}</b>
          </button>
          <button className="shuffle-button" onClick={dealNewStack} aria-label="Shuffle commander stack"><span>↻</span> Shuffle</button>
        </div>
      </header>

      {view === "discover" && <section className="discover-page">
        <details className="filters-panel">
          <summary><span>Filters</span><small>{ranked.length.toLocaleString()} matches</small><i aria-hidden="true">+</i></summary>
          <div className="filter-grid">
            <fieldset className="color-control">
              <legend>Color identity</legend>
              <div className="color-filter">
                {COLORS.map((color) => <button key={color.key} className={selectedColors.includes(color.key) ? "selected" : ""} onClick={() => toggleColor(color.key)} aria-label={color.label}><ManaSymbol symbol={`{${color.key}}`} symbols={symbols} /></button>)}
              </div>
            </fieldset>
            <label className="filter-control" htmlFor="min-obscurity"><span>Obscurity <output>{minObscurity}+</output></span><input id="min-obscurity" type="range" min="35" max="95" step="5" value={minObscurity} onChange={(event) => setMinObscurity(Number(event.target.value))} /></label>
            <label className="filter-control" htmlFor="complexity"><span>Rules text</span><select id="complexity" value={complexityFilter} onChange={(event) => setComplexityFilter(event.target.value as Complexity)}><option value="any">Any complexity</option><option value="clean">Clean</option><option value="layered">Layered</option><option value="crunchy">Crunchy</option></select></label>
            <label className="filter-control" htmlFor="theme"><span>Theme</span><select id="theme" value={theme} onChange={(event) => setTheme(event.target.value)}>{themes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="challenge-toggle"><input type="checkbox" checked={showChallengePicks} onChange={(event) => setShowChallengePicks(event.target.checked)} /><span>Include challenge picks <small>+{Math.max(0, cards.length - recommendedTotal).toLocaleString()}</small></span></label>
            <button className="reset-filters" onClick={resetFilters}>Reset</button>
          </div>
        </details>

        <section className="discovery-stage">
          {loading ? <div className="loading-stage"><Skeleton height="62vh" borderRadius={12} baseColor="#211f1a" highlightColor="#353126" /><p>Loading commanders…</p></div>
            : error ? <div className="empty-stage"><h1>Couldn’t load commanders.</h1><p>{error}</p><button onClick={loadCommanders}>Try again</button></div>
              : current ? <>
                <div className="art-backdrop" style={{ backgroundImage: "url(" + current.artUrl + ")" }} />
                <div className="card-column">
                  <div
                    className="swipe-card"
                    data-intent={swipeIntent}
                    onPointerDown={beginSwipe}
                    onPointerMove={moveSwipe}
                    onPointerUp={(event) => finishSwipe(event, current)}
                    onPointerCancel={cancelSwipe}
                    style={drag.active ? { transform: `translate3d(${drag.x}px, ${Math.min(drag.y, 24)}px, 0) rotate(${drag.x / 28}deg)`, transition: "none" } : undefined}
                  >
                    <span className="swipe-feedback reject">Reject</span>
                    <span className="swipe-feedback intriguing">Intriguing</span>
                    <span className="swipe-feedback favorite">Favorite</span>
                    <a href={current.scryfallUrl} target="_blank" rel="noreferrer" aria-label={"View " + current.name + " on Scryfall"}>
                      <img src={current.imageUrl} alt={current.name} draggable="false" referrerPolicy="no-referrer" />
                    </a>
                  </div>
                  <p className="swipe-hint"><span>← Reject</span><span>→ Intriguing</span><span>↑ Favorite</span></p>
                </div>

                <article className="commander-profile">
                  <div className="profile-topline"><ColorPips colors={current.colorIdentity} symbols={symbols} /><span>{current.setName} · {new Date(current.releasedAt).getFullYear()}</span>{current.challengePick && <em>Challenge</em>}</div>
                  <div className="commander-title"><h1>{current.name}</h1><ManaCost cost={current.manaCost} symbols={symbols} /></div>
                  <p className="type-line">{current.typeLine}</p>
                  <OracleText text={current.oracleText} symbols={symbols} />

                  <div className="card-meta">
                    <span><strong>{current.obscurityScore}</strong>/100 obscure</span>
                    <span><strong>{current.deckCount !== null ? current.deckCount.toLocaleString() : "#" + current.popularityRank.toLocaleString()}</strong>{current.deckCount !== null ? " decks" : " rank"}</span>
                    <span><strong>{money(current.price)}</strong> market</span>
                  </div>

                  <p className="why-text">{current.why}</p>
                  {current.challengePick && <p className="challenge-note">{current.challengeReason}</p>}
                  {current.themes.length > 0 && <div className="theme-chips">{current.themes.slice(0, 4).map((item) => <button key={item} onClick={() => setTheme(item)}>{item}</button>)}</div>}
                  {current.caution && <details className="build-note"><summary>Build-around note</summary><p>{current.caution}</p></details>}

                  <div className="reaction-bar" aria-label="Commander reactions">
                    <button className="pass" onClick={() => reactTo(current, "pass")}><span>←</span> Reject</button>
                    <button className="intrigue" onClick={() => reactTo(current, "intrigue")}><span>?</span> Intriguing</button>
                    <button className="love" onClick={() => reactTo(current, "love")}><span>↑</span> Favorite</button>
                  </div>
                </article>
              </>
                : <div className="empty-stage"><h1>No more matches.</h1><p>Change a filter or reshuffle the stack.</p><div><button onClick={resetFilters}>Reset filters</button><button onClick={dealNewStack}>Shuffle</button></div></div>}
        </section>
      </section>}

      {view === "shortlist" && <section className="shortlist-page">
        <div className="shortlist-heading">
          <button onClick={() => setView("discover")}>← Discover</button>
          <h1>Shortlist</h1>
          <p>{shortlist.length} saved on this device</p>
        </div>
        {shortlist.length ? <div className="shortlist-grid">{shortlist.map((card) => <article key={card.id} className="saved-card">
          <button className="saved-image" onClick={() => selectCard(card)}><img src={card.imageUrl} alt={card.name} loading="lazy" referrerPolicy="no-referrer" /></button>
          <div className="saved-copy">
            <div><ColorPips colors={card.colorIdentity} symbols={symbols} /><button className="remove-button" onClick={() => setShortlist((items) => items.filter((item) => item.id !== card.id))} aria-label={"Remove " + card.name}>×</button></div>
            <button className="saved-name" onClick={() => selectCard(card)}>{card.name}</button>
            <ManaCost cost={card.manaCost} symbols={symbols} />
            <p>{card.obscurityScore}/100 obscure · {card.deckCount !== null ? card.deckCount.toLocaleString() + " decks" : "#" + card.popularityRank.toLocaleString()}</p>
          </div>
        </article>)}</div>
          : <div className="empty-shortlist"><h2>Nothing saved yet.</h2><p>Swipe up or tap Favorite on a commander.</p><button onClick={() => setView("discover")}>Discover commanders</button></div>}
      </section>}

      <footer>Card data and imagery via Scryfall · Popularity signals via EDHREC</footer>
    </main>
  );
}
