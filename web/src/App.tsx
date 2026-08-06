import { useEffect, useMemo, useState } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import "./styles.css";

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

type SignatureCard = {
  id: string;
  name: string;
  imageUrl: string;
  scryfallUrl: string;
};

type View = "discover" | "shortlist";
type Complexity = "any" | "clean" | "layered" | "crunchy";

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

function ageLabel(date: string) {
  const years = Math.max(0, (Date.now() - new Date(date).getTime()) / 31_556_952_000);
  if (years < 1) return "under a year old";
  if (years < 2) return "1 year old";
  return Math.floor(years) + " years old";
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

function ColorPips({ colors, symbols }: { colors: string[]; symbols: Record<string, string> }) {
  const pips = colors.length ? colors : ["C"];
  return <span className="color-pips" aria-label={(colors.length ? colors : ["Colorless"]).join(", ")}>{pips.map((color) => <ManaSymbol key={color} symbol={`{${color}}`} symbols={symbols} />)}</span>;
}

function MiniCard({ card, symbols, onSelect }: { card: CommanderCard; symbols: Record<string, string>; onSelect: (card: CommanderCard) => void }) {
  return (
    <button className="mini-card" onClick={() => onSelect(card)}>
      <img src={card.artUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      <span className="mini-shade" />
      <span className="mini-copy">
        <ColorPips colors={card.colorIdentity} symbols={symbols} />
        <strong>{card.name}</strong>
        <small>{card.deckCount !== null ? `${card.deckCount.toLocaleString()} decks` : `#${card.popularityRank.toLocaleString()} commander`}</small>
      </span>
    </button>
  );
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
  const [refresh, setRefresh] = useState(1);
  const [storageReady, setStorageReady] = useState(false);

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
    // Discovery reloads only when the user deals a new stack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  async function loadCommanders() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(import.meta.env.BASE_URL + "data/commanders.json");
      const result = await response.json() as { cards?: CommanderCard[]; symbols?: Record<string, string>; error?: string };
      if (!response.ok || !result.cards?.length) throw new Error(result.error ?? "No deep cuts were found for that filter.");
      setCards(shuffled(result.cards));
      setSymbols(result.symbols ?? {});
      setSeen([]);
      setActiveId(result.cards[0].id);
      setTheme("Any theme");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Commander discovery failed.");
    } finally {
      setLoading(false);
    }
  }

  const themes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of cards) if (showChallengePicks || !card.challengePick) for (const item of card.themes) counts.set(item, (counts.get(item) ?? 0) + 1);
    return ["Any theme", ...Array.from(counts.entries()).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([item]) => item)];
  }, [cards, showChallengePicks]);

  const recommendedTotal = useMemo(() => cards.filter((card) => !card.challengePick).length, [cards]);

  const ranked = useMemo(() => {
    return cards
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
      .sort((a, b) => b.score - a.score || b.card.popularityRank - a.card.popularityRank)
      .map((entry) => entry.card);
  }, [cards, selectedColors, minObscurity, showChallengePicks, theme, complexityFilter, taste]);

  const current = useMemo(() => ranked.find((card) => card.id === activeId && !seen.includes(card.id)) ?? ranked.find((card) => !seen.includes(card.id)) ?? null, [ranked, activeId, seen]);
  const comingUp = useMemo(() => ranked.filter((card) => card.id !== current?.id && !seen.includes(card.id)).slice(0, 5), [ranked, current, seen]);
  const tasteLeaders = useMemo(() => Object.entries(taste).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 5), [taste]);

  function toggleColor(color: string) {
    setSelectedColors((currentColors) => {
      if (color === "C") return currentColors.includes("C") ? [] : ["C"];
      const withoutColorless = currentColors.filter((item) => item !== "C");
      return withoutColorless.includes(color) ? withoutColorless.filter((item) => item !== color) : [...withoutColorless, color];
    });
  }

  function reactTo(card: CommanderCard, reaction: "pass" | "intrigue" | "love") {
    setSeen((items) => items.includes(card.id) ? items : [...items, card.id]);
    setActiveId(null);
    const weight = reaction === "love" ? 2 : reaction === "intrigue" ? 1 : -0.25;
    setTaste((currentTaste) => {
      const next = { ...currentTaste };
      for (const item of card.themes) next[item] = (next[item] ?? 0) + weight;
      return next;
    });
    if (reaction !== "pass") setShortlist((items) => items.some((item) => item.id === card.id) ? items : [...items, card]);
  }

  function selectCard(card: CommanderCard) {
    setSeen((items) => items.filter((id) => id !== card.id));
    setActiveId(card.id);
    setView("discover");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dealNewStack() {
    setRefresh((value) => value + 1);
  }

  return (
    <main>
      <header className="site-header">
        <button className="wordmark" onClick={() => setView("discover")}><span>DC</span><strong>DEEP CUTS</strong><small>COMMANDER DISCOVERY</small></button>
        <nav aria-label="Primary navigation">
          <button className={view === "discover" ? "active" : ""} onClick={() => setView("discover")}>Discover</button>
          <button className={view === "shortlist" ? "active" : ""} onClick={() => setView("shortlist")}>Shortlist <b>{shortlist.length}</b></button>
        </nav>
        <button className="deal-button" onClick={dealNewStack}>Deal a new stack <span>↻</span></button>
      </header>

      {view === "discover" && <>
        <section className="discovery-shell">
          <aside className="filter-rail">
            <div className="crate-graphic">
              <img src={import.meta.env.BASE_URL + "crate-dig.png"} alt="A hand digging through a crate of mysterious card sleeves" />
              <div><span>{recommendedTotal.toLocaleString()} RECOMMENDED · {cards.length.toLocaleString()} ARCHIVED</span><b>Find the legend everyone missed.</b></div>
            </div>
            <div className="rail-heading"><span>01</span><div><b>TUNE THE CRATE</b><p>Exact color identity</p></div></div>
            <div className="color-filter">
              {COLORS.map((color) => <button key={color.key} className={selectedColors.includes(color.key) ? "selected" : ""} onClick={() => toggleColor(color.key)} aria-label={color.label}><ManaSymbol symbol={`{${color.key}}`} symbols={symbols} /></button>)}
            </div>
            <button className="apply-colors" onClick={dealNewStack} disabled={loading}>Search these colors <span>→</span></button>

            <div className="filter-block">
              <label htmlFor="min-obscurity"><span>Obscurity floor</span><b>{minObscurity} / 100</b></label>
              <input id="min-obscurity" type="range" min="35" max="95" step="5" value={minObscurity} onChange={(event) => setMinObscurity(Number(event.target.value))} />
              <div className="range-scale"><span>Broad search</span><span>Archaeological</span></div>
            </div>

            <div className="filter-block">
              <label htmlFor="complexity"><span>Rules texture</span></label>
              <select id="complexity" value={complexityFilter} onChange={(event) => setComplexityFilter(event.target.value as Complexity)}>
                <option value="any">Any complexity</option>
                <option value="clean">Clean &amp; focused</option>
                <option value="layered">Layered</option>
                <option value="crunchy">Delightfully crunchy</option>
              </select>
            </div>

            <label className="challenge-toggle">
              <input type="checkbox" checked={showChallengePicks} onChange={(event) => setShowChallengePicks(event.target.checked)} />
              <span><b>Show challenge picks</b><small>Include {Math.max(0, cards.length - recommendedTotal).toLocaleString()} mechanically flat or ultra-narrow legends</small></span>
              <i aria-hidden="true" />
            </label>

            <div className="filter-block">
              <label><span>Mechanical neighborhood</span></label>
              <div className="theme-list">{themes.map((item) => <button key={item} className={theme === item ? "selected" : ""} onClick={() => setTheme(item)}>{item}</button>)}</div>
            </div>

            <div className="taste-map">
              <span>YOUR TASTE SIGNAL</span>
              {tasteLeaders.length ? tasteLeaders.map(([item, value]) => <div key={item}><b>{item}</b><i><span style={{ width: Math.min(100, value * 18) + "%" }} /></i></div>) : <p>React to a few commanders and the crate will quietly reorganize itself.</p>}
            </div>
          </aside>

          <section className="discovery-stage">
            {loading ? <div className="loading-stage"><Skeleton height="68vh" borderRadius={12} baseColor="#211f1a" highlightColor="#353126" /><p>Digging through 3,000+ legal commanders…</p></div> : error ? <div className="empty-stage"><span>!</span><h1>The crate jammed.</h1><p>{error}</p><button onClick={dealNewStack}>Try another stack</button></div> : current ? <>
              <div className="art-backdrop" style={{ backgroundImage: "url(" + current.artUrl + ")" }} />
              <div className="stage-noise" />
              <div className="stage-index"><span>DEEP CUT</span><b>{String(Math.max(1, ranked.findIndex((card) => card.id === current.id) + 1)).padStart(2, "0")}</b><small>OF {String(ranked.length).padStart(2, "0")}</small></div>

              <div className="card-display">
                <a href={current.scryfallUrl} target="_blank" rel="noreferrer" aria-label={"View " + current.name + " on Scryfall"}>
                  <img src={current.imageUrl} alt={current.name} referrerPolicy="no-referrer" />
                </a>
                <span className="image-credit">IMAGE VIA SCRYFALL ↗</span>
              </div>

              <article className="commander-profile">
                <div className="profile-topline"><ColorPips colors={current.colorIdentity} symbols={symbols} /><span>{current.setName} · {new Date(current.releasedAt).getFullYear()}</span>{current.challengePick && <em className="challenge-badge">Challenge pick</em>}</div>
                <div className="commander-title"><h1>{current.name}</h1><ManaCost cost={current.manaCost} symbols={symbols} /></div>
                <p className="type-line">{current.typeLine}</p>
                <p className="oracle-text">{current.oracleText}</p>

                <div className="obscurity-row">
                  <div className="obscurity-score"><span>OBSCURITY</span><strong>{current.obscurityScore}</strong><small>/100</small></div>
                  <div><strong>{current.deckCount !== null ? current.deckCount.toLocaleString() : `#${current.popularityRank.toLocaleString()}`}</strong><span>{current.deckCount !== null ? "tracked decks" : "commander rank"}</span></div>
                  <div><strong>{ageLabel(current.releasedAt)}</strong><span>release age</span></div>
                  <div><strong>{money(current.price)}</strong><span>card price</span></div>
                </div>

                <div className="editorial-note"><span>WHY IT'S A DEEP CUT</span><p>{current.why}</p></div>
                {current.challengePick && <div className="challenge-note"><span>WHY IT'S HIDDEN BY DEFAULT</span><p>{current.challengeReason}</p></div>}
                <div className="theme-chips">{current.themes.slice(0, 5).map((item) => <button key={item} onClick={() => setTheme(item)}>{item}</button>)}</div>

                {current.signatures.length > 0 && <div className="signature-block"><span>SIGNATURE LEADS</span><div className="signature-cards">{current.signatures.map((item) => <a key={item.id} href={item.scryfallUrl} target="_blank" rel="noreferrer"><img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /><b>{item.name}</b></a>)}</div></div>}
                <div className="watch-out"><span>△</span><p><b>Build-around warning</b>{current.caution}</p></div>

                <div className="reaction-bar">
                  <button className="pass" onClick={() => reactTo(current, "pass")}><span>×</span>Pass</button>
                  <button className="intrigue" onClick={() => reactTo(current, "intrigue")}><span>＋</span>Intriguing</button>
                  <button className="love" onClick={() => reactTo(current, "love")}><span>♥</span>Love this</button>
                </div>
              </article>
            </> : <div className="empty-stage"><span>◎</span><h1>You reached the back of this crate.</h1><p>Loosen a filter or deal a fresh stack of forgotten legends.</p><button onClick={dealNewStack}>Deal another stack</button></div>}
          </section>
        </section>

        {!loading && comingUp.length > 0 && <section className="coming-up">
          <div className="section-heading"><div><span>NEXT IN THE CRATE</span><h2>Keep digging.</h2></div><p>The order adapts as you react.</p></div>
          <div className="mini-grid">{comingUp.map((card) => <MiniCard key={card.id} card={card} symbols={symbols} onSelect={selectCard} />)}</div>
        </section>}
      </>}

      {view === "shortlist" && <section className="shortlist-page">
        <div className="shortlist-heading"><span>YOUR PRIVATE STACK</span><h1>The legends that survived the flip.</h1><p>Saved only in this browser. Open any card to return to its full profile.</p></div>
        {shortlist.length ? <div className="shortlist-grid">{shortlist.map((card, index) => <article key={card.id} className="saved-card">
          <button className="saved-image" onClick={() => selectCard(card)}><img src={card.imageUrl} alt={card.name} loading="lazy" referrerPolicy="no-referrer" /><span>{String(index + 1).padStart(2, "0")}</span></button>
          <div><ColorPips colors={card.colorIdentity} symbols={symbols} /><h2>{card.name}</h2><ManaCost cost={card.manaCost} symbols={symbols} /><p>{card.why}</p><div className="saved-meta"><span>{card.deckCount !== null ? `${card.deckCount.toLocaleString()} decks` : `#${card.popularityRank.toLocaleString()} commander`}</span><span>{card.obscurityScore}/100 obscure</span></div><button className="remove-button" onClick={() => setShortlist((items) => items.filter((item) => item.id !== card.id))}>Remove</button></div>
        </article>)}</div> : <div className="empty-shortlist"><span>◇</span><h2>Nothing sleeved yet.</h2><p>Mark a commander Intriguing or Love this and it will appear here.</p><button onClick={() => setView("discover")}>Start discovering</button></div>}
      </section>}

      <footer><span>DEEP CUTS · LOCAL PROTOTYPE</span><span>POPULARITY SIGNALS VIA EDHREC · CARD DATA &amp; IMAGERY VIA SCRYFALL</span></footer>
    </main>
  );
}
