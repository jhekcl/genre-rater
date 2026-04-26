import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { computedScore, everynoiseUrl } from "./score";
import {
  exportData,
  getAllRatings,
  getMeta,
  getRating,
  importData,
  setMeta,
  setRating,
} from "./db";

const TAB_ITEMS = [
  { id: "next", label: "Noter" },
  { id: "search", label: "Recherche" },
  { id: "rank", label: "Classement" },
  { id: "stats", label: "Stats" },
  { id: "backup", label: "Backup" },
];

const SCORE_INPUT_PATTERN = /^\d{0,2}(?:[.,]\d{0,2})?$/;

function normalizeScoreInput(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "." || trimmed === ",") return "0.";
  if (!SCORE_INPUT_PATTERN.test(trimmed)) return null;

  const normalized = trimmed.replace(",", ".");
  const parsed = Number(normalized);

  if (Number.isNaN(parsed)) return "";
  if (parsed < 0) return "0";
  if (parsed > 10) return "10";

  return normalized;
}

function parseScoreInput(value) {
  if (value === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (Number.isNaN(parsed)) return null;
  if (parsed < 0 || parsed > 10) return null;
  return parsed;
}

function hasAnyInfo(rating) {
  if (!rating) return false;
  const hasSkip = rating.skip != null;
  const hasKiff = rating.kiff != null;
  const hasSpecial = !!rating.special;
  const hasFlou = !!rating.flou;
  const hasComment = (rating.comment ?? "").trim().length > 0;
  return hasSkip || hasKiff || hasSpecial || hasFlou || hasComment;
}

function isUnrated(rating) {
  return !hasAnyInfo(rating);
}

function median(values) {
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    return (values[mid - 1] + values[mid]) / 2;
  }
  return values[mid];
}

function formatDateTime(isoString) {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tab-button ${active ? "active" : ""}`}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-hint">{hint}</span>
    </article>
  );
}

export default function App() {
  const [genres, setGenres] = useState([]);
  const [tab, setTab] = useState("next"); // next | search | rank | stats | backup

  // progress
  const [idx, setIdx] = useState(0);
  const [genreId, setGenreId] = useState(0);

  // current rating fields
  const [skip, setSkip] = useState("");
  const [kiff, setKiff] = useState("");
  const [special, setSpecial] = useState(false);
  const [flou, setFlou] = useState(false);
  const [comment, setComment] = useState("");

  // data views
  const [allRatings, setAllRatings] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [rankOrder, setRankOrder] = useState("desc"); // desc | asc

  const fileInputRef = useRef(null);

  const genreName = genres[genreId] || "";
  const url = useMemo(() => (genreName ? everynoiseUrl(genreName) : ""), [genreName]);

  const parsedSkip = useMemo(() => parseScoreInput(skip), [skip]);
  const parsedKiff = useMemo(() => parseScoreInput(kiff), [kiff]);

  const score = useMemo(
    () => computedScore(parsedSkip, parsedKiff, special, flou),
    [parsedSkip, parsedKiff, special, flou]
  );

  const ratingById = useMemo(() => {
    const map = new Map();
    for (const rating of allRatings) {
      map.set(rating.genreId, rating);
    }
    return map;
  }, [allRatings]);

  async function loadCurrentRating(gid) {
    const rating = await getRating(gid);
    setSkip(rating?.skip == null ? "" : String(rating.skip));
    setKiff(rating?.kiff == null ? "" : String(rating.kiff));
    setSpecial(!!rating?.special);
    setFlou(!!rating?.flou);
    setComment(rating?.comment ?? "");
  }

  async function refreshAllRatings() {
    const ratings = await getAllRatings();
    setAllRatings(ratings);
  }

  useEffect(() => {
    (async () => {
      const text = await fetch("./genres.txt").then((response) => response.text());
      const lines = text
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      setGenres(lines);

      const savedIdx = (await getMeta("idx")) ?? 0;
      const safeIdx = lines.length ? Math.max(0, Math.min(savedIdx, lines.length - 1)) : 0;

      setIdx(safeIdx);
      setGenreId(safeIdx);

      await loadCurrentRating(safeIdx);
      await refreshAllRatings();
    })();
  }, []);

  async function saveCurrent() {
    if (!genres.length) return;

    const rating = {
      genreId,
      name: genreName,
      url,
      skip: parsedSkip,
      kiff: parsedKiff,
      special,
      flou,
      comment: comment.trim() || null,
      updatedAt: new Date().toISOString(),
    };

    await setRating(rating);
    await refreshAllRatings();
    window.navigator?.vibrate?.(20);
  }

  async function nextRaw() {
    if (!genres.length) return;
    const nextIndex = (idx + 1) % genres.length;
    setIdx(nextIndex);
    setGenreId(nextIndex);
    await setMeta("idx", nextIndex);
    await loadCurrentRating(nextIndex);
  }

  async function prevRaw() {
    if (!genres.length) return;
    const prevIndex = (idx - 1 + genres.length) % genres.length;
    setIdx(prevIndex);
    setGenreId(prevIndex);
    await setMeta("idx", prevIndex);
    await loadCurrentRating(prevIndex);
  }

  async function nextGenre() {
    if (!genres.length) return;

    const start = (idx + 1) % genres.length;

    for (let step = 0; step < genres.length; step += 1) {
      const gid = (start + step) % genres.length;
      const rating = ratingById.get(gid);
      if (isUnrated(rating)) {
        setIdx(gid);
        setGenreId(gid);
        await setMeta("idx", gid);
        await loadCurrentRating(gid);
        return;
      }
    }

    alert("Tous les genres ont deja une info (note, case ou commentaire). 🎉");
  }

  async function openGenreById(id) {
    if (!genres.length) return;
    const gid = Math.max(0, Math.min(id, genres.length - 1));
    setIdx(gid);
    setGenreId(gid);
    await setMeta("idx", gid);
    await loadCurrentRating(gid);
    setTab("next");
  }

  const treatedRatings = useMemo(
    () => allRatings.filter((rating) => hasAnyInfo(rating)),
    [allRatings]
  );

  const treatedById = useMemo(() => {
    const set = new Set();
    for (const rating of treatedRatings) {
      set.add(rating.genreId);
    }
    return set;
  }, [treatedRatings]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return genres
      .map((name, id) => [id, name])
      .filter(([, name]) => name.toLowerCase().includes(query));
  }, [searchQuery, genres]);

  const scoredItems = useMemo(() => {
    const items = [];

    for (const rating of treatedRatings) {
      if (rating?.special) continue;

      const computed = computedScore(
        rating?.skip ?? null,
        rating?.kiff ?? null,
        !!rating?.special,
        !!rating?.flou
      );

      if (computed == null) continue;

      items.push({
        genreId: rating.genreId,
        name: rating.name,
        score: computed,
        flou: !!rating.flou,
      });
    }

    items.sort((a, b) => (rankOrder === "desc" ? b.score - a.score : a.score - b.score));
    return items;
  }, [treatedRatings, rankOrder]);

  const stats = useMemo(() => {
    const totalGenres = genres.length;
    const treatedCount = treatedRatings.length;
    const pendingCount = Math.max(totalGenres - treatedCount, 0);
    const progress = totalGenres ? (treatedCount / totalGenres) * 100 : 0;

    let specialCount = 0;
    let flouCount = 0;
    let latestUpdate = null;

    const scoreRows = [];

    for (const rating of treatedRatings) {
      if (rating?.special) specialCount += 1;
      if (rating?.flou) flouCount += 1;

      if (rating?.updatedAt && (!latestUpdate || rating.updatedAt > latestUpdate)) {
        latestUpdate = rating.updatedAt;
      }

      const computed = computedScore(
        rating?.skip ?? null,
        rating?.kiff ?? null,
        !!rating?.special,
        !!rating?.flou
      );

      if (computed == null) continue;

      scoreRows.push({
        genreId: rating.genreId,
        name: rating.name,
        score: computed,
      });
    }

    const scoreValues = scoreRows
      .map((entry) => entry.score)
      .sort((a, b) => a - b);

    const scoredCount = scoreValues.length;
    const avg = scoredCount
      ? scoreValues.reduce((accumulator, current) => accumulator + current, 0) / scoredCount
      : null;

    const med = median(scoreValues);
    const highBand = scoreValues.filter((value) => value >= 7).length;
    const lowBand = scoreValues.filter((value) => value < 4).length;

    const buckets = Array.from({ length: 11 }, (_, scoreValue) => ({
      scoreValue,
      count: 0,
    }));

    for (const value of scoreValues) {
      const bucketIndex = Math.max(0, Math.min(10, Math.round(value)));
      buckets[bucketIndex].count += 1;
    }

    const maxBucket = buckets.reduce(
      (currentMax, bucket) => Math.max(currentMax, bucket.count),
      1
    );

    const ordered = [...scoreRows].sort((a, b) => b.score - a.score);
    const topThree = ordered.slice(0, 3);
    const bottomThree = [...ordered].slice(-3).reverse();

    return {
      totalGenres,
      storedCount: allRatings.length,
      treatedCount,
      pendingCount,
      progress,
      specialCount,
      flouCount,
      scoredCount,
      avg,
      median: med,
      highBand,
      lowBand,
      buckets,
      maxBucket,
      topThree,
      bottomThree,
      latestUpdate,
    };
  }, [genres.length, allRatings, treatedRatings]);

  async function doExport() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `genre-rater-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async function doImportFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    await importData(data);
    await refreshAllRatings();

    const savedIdx = (await getMeta("idx")) ?? 0;
    const safeIdx = Math.max(0, Math.min(savedIdx, genres.length - 1));

    setIdx(safeIdx);
    setGenreId(safeIdx);
    await loadCurrentRating(safeIdx);
    alert("Import termine ✅");
  }

  const scoreLabel = special
    ? "Exclu (special)"
    : score == null
      ? "En attente"
      : score.toFixed(2);

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-one" />
      <div className="bg-orb bg-orb-two" />

      <main className="app">
        <header className="app-header">
          <div className="app-title-wrap">
            <h1 className="app-title">Genre Rater</h1>
            <p className="app-subtitle">
              Un cockpit mobile pour noter, retrouver et classer tes micro-genres.
            </p>
          </div>
        </header>

        <nav className="tabs" aria-label="Onglets de navigation">
          {TAB_ITEMS.map((item) => (
            <TabButton
              key={item.id}
              active={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </TabButton>
          ))}
        </nav>

        {tab === "next" && (
          <section className="panel">
            <div className="panel-title-row">
              <h2 className="panel-title">{genreName || "Chargement..."}</h2>
              {genreName && <span className="genre-id">#{genreId}</span>}
            </div>

            {url && (
              <a className="genre-link" href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            )}

            <div className="input-grid">
              <label className="field">
                <span>Skip (0-10)</span>
                <input
                  className="score-input"
                  value={skip}
                  onChange={(event) => {
                    const normalized = normalizeScoreInput(event.target.value);
                    if (normalized !== null) setSkip(normalized);
                  }}
                  inputMode="decimal"
                  placeholder="ex: 6.5"
                />
              </label>

              <label className="field">
                <span>Kiff (0-10)</span>
                <input
                  className="score-input"
                  value={kiff}
                  onChange={(event) => {
                    const normalized = normalizeScoreInput(event.target.value);
                    if (normalized !== null) setKiff(normalized);
                  }}
                  inputMode="decimal"
                  placeholder="ex: 8.25"
                />
              </label>
            </div>

            <div className="toggle-row">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={special}
                  onChange={(event) => setSpecial(event.target.checked)}
                />
                <span>Special (exclu du score)</span>
              </label>

              <label className="check-label">
                <input
                  type="checkbox"
                  checked={flou}
                  onChange={(event) => setFlou(event.target.checked)}
                />
                <span>Flou (0.35 / 0.65)</span>
              </label>
            </div>

            <label className="field">
              <span>Commentaire</span>
              <textarea
                className="comment-input"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={4}
                placeholder="Un mot sur l'ambiance, les vibes, les refs..."
              />
            </label>

            <div className="score-pill">
              <span>Note calculee</span>
              <strong>{scoreLabel}</strong>
            </div>

            <div className="action-grid">
              <button type="button" className="button-secondary" onClick={prevRaw}>
                Previous brut
              </button>

              <button type="button" className="button-primary" onClick={saveCurrent}>
                Enregistrer
              </button>

              <button
                type="button"
                className="button-primary"
                onClick={async () => {
                  await saveCurrent();
                  await nextGenre();
                }}
              >
                Enregistrer + Next non note
              </button>

              <button type="button" className="button-ghost" onClick={nextRaw}>
                Next brut
              </button>
            </div>
          </section>
        )}

        {tab === "search" && (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Recherche sans limite</h2>
              <p className="panel-subtitle">
                Affiche tous les resultats correspondant a ta requete.
              </p>
            </div>

            <input
              className="text-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tape un mot, un style, une vibe..."
            />

            <div className="results-info">
              {searchQuery.trim()
                ? `${searchResults.length} resultat(s)`
                : `${genres.length} genres indexes`}
            </div>

            {!searchQuery.trim() && (
              <div className="hint-block">
                Lance une recherche pour ouvrir un genre instantanement.
              </div>
            )}

            {searchQuery.trim() && searchResults.length === 0 && (
              <div className="empty-block">Aucun genre trouve.</div>
            )}

            {searchQuery.trim() && searchResults.length > 0 && (
              <div className="list scroll-zone">
                {searchResults.map(([id, name]) => {
                  const rating = ratingById.get(id);
                  const treated = treatedById.has(id);
                  const rowScore = computedScore(
                    rating?.skip ?? null,
                    rating?.kiff ?? null,
                    !!rating?.special,
                    !!rating?.flou
                  );

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => openGenreById(id)}
                      className="row-button"
                    >
                      <span className="row-main">
                        <strong>#{id}</strong>
                        <span>{name}</span>
                      </span>

                      <span className={`status-chip ${treated ? "treated" : "pending"}`}>
                        {!treated
                          ? "A traiter"
                          : rowScore == null
                            ? "Traite"
                            : rowScore.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "rank" && (
          <section className="panel">
            <div className="panel-title-row">
              <h2 className="panel-title">Classement</h2>
              <select
                className="select-input"
                value={rankOrder}
                onChange={(event) => setRankOrder(event.target.value)}
              >
                <option value="desc">Decroissant (meilleurs)</option>
                <option value="asc">Croissant (pires)</option>
              </select>
            </div>

            <p className="panel-subtitle">
              {scoredItems.length} genre(s) classes (special exclus, skip + kiff requis)
            </p>

            {!scoredItems.length && <div className="empty-block">Aucun score calcule pour l'instant.</div>}

            {!!scoredItems.length && (
              <div className="list scroll-zone">
                {scoredItems.map((item, index) => (
                  <button
                    key={item.genreId}
                    type="button"
                    onClick={() => openGenreById(item.genreId)}
                    className="rank-row"
                  >
                    <span className="rank-main">
                      <strong>#{index + 1}</strong>
                      <span>{item.name}</span>
                    </span>

                    <span className="rank-meta">
                      <strong className="rank-pill">{item.score.toFixed(2)}</strong>
                      <span>#{item.genreId}</span>
                      {item.flou && <span>flou</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "stats" && (
          <section className="panel panel-stats">
            <div className="stats-hero">
              <div
                className="stats-progress-ring"
                style={{
                  background: `conic-gradient(var(--accent-strong) ${stats.progress}%, var(--sand-200) 0)`,
                }}
              >
                <div className="stats-progress-inner">
                  <strong>{Math.round(stats.progress)}%</strong>
                  <span>couverts</span>
                </div>
              </div>

              <div>
                <h2 className="panel-title">Pulse des stats</h2>
                <p className="panel-subtitle">
                  {stats.treatedCount} genres traites sur {stats.totalGenres || 0}.
                </p>
                <p className="panel-subtitle">
                  Derniere activite: {formatDateTime(stats.latestUpdate)}
                </p>
              </div>
            </div>

            <div className="metric-grid">
              <MetricCard
                label="Genres traites"
                value={stats.treatedCount}
                hint={`${stats.pendingCount} restant(s)`}
              />
              <MetricCard
                label="Scores calcules"
                value={stats.scoredCount}
                hint="Special exclus"
              />
              <MetricCard
                label="Moyenne"
                value={stats.avg == null ? "-" : stats.avg.toFixed(2)}
                hint="Tendance globale"
              />
              <MetricCard
                label="Mediane"
                value={stats.median == null ? "-" : stats.median.toFixed(2)}
                hint="Valeur centrale"
              />
            </div>

            <div className="signal-row">
              <span className="signal-chip">Special: {stats.specialCount}</span>
              <span className="signal-chip">Flou: {stats.flouCount}</span>
              <span className="signal-chip">Score &gt;= 7: {stats.highBand}</span>
              <span className="signal-chip">Score &lt; 4: {stats.lowBand}</span>
            </div>

            <section className="panel-block">
              <h3>Distribution des notes (arrondi 0-10)</h3>
              <div className="distribution-list">
                {stats.buckets.map((bucket) => (
                  <div className="distribution-row" key={bucket.scoreValue}>
                    <span className="bucket-label">{bucket.scoreValue}</span>
                    <div className="bucket-track">
                      <div
                        className="bucket-fill"
                        style={{ width: `${(bucket.count / stats.maxBucket) * 100}%` }}
                      />
                    </div>
                    <span className="bucket-count">{bucket.count}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="duo-grid">
              <section className="panel-block">
                <h3>Top 3 du moment</h3>
                {!stats.topThree.length && <p className="panel-subtitle">Pas encore de classement.</p>}
                {stats.topThree.map((entry) => (
                  <button
                    key={`top-${entry.genreId}`}
                    type="button"
                    className="mini-row"
                    onClick={() => openGenreById(entry.genreId)}
                  >
                    <span className="mini-main">{entry.name}</span>
                    <strong>{entry.score.toFixed(2)}</strong>
                  </button>
                ))}
              </section>

              <section className="panel-block">
                <h3>A retravailler</h3>
                {!stats.bottomThree.length && <p className="panel-subtitle">Pas encore de classement.</p>}
                {stats.bottomThree.map((entry) => (
                  <button
                    key={`bottom-${entry.genreId}`}
                    type="button"
                    className="mini-row"
                    onClick={() => openGenreById(entry.genreId)}
                  >
                    <span className="mini-main">{entry.name}</span>
                    <strong>{entry.score.toFixed(2)}</strong>
                  </button>
                ))}
              </section>
            </div>
          </section>
        )}

        {tab === "backup" && (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Backup</h2>
              <p className="panel-subtitle">
                Exporte regulierement pour securiser tes notes en cas de changement d'appareil.
              </p>
            </div>

            <div className="backup-actions">
              <button type="button" className="button-primary" onClick={doExport}>
                Export JSON
              </button>

              <button
                type="button"
                className="button-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Import JSON
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    await doImportFile(file);
                  } catch (error) {
                    alert(`Import echoue: ${error?.message ?? String(error)}`);
                  } finally {
                    event.target.value = "";
                  }
                }}
              />
            </div>

            <div className="hint-block">
              Astuce: stocke ton export dans Drive, iCloud ou un coffre local chiffre.
            </div>
          </section>
        )}

        <footer className="app-footer">
          Offline OK • Donnees locales • {stats.treatedCount}/{genres.length || 0} genres traites
          ({stats.storedCount} enregistrements)
        </footer>
      </main>
    </div>
  );
}
