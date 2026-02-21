import { useEffect, useMemo, useRef, useState } from "react";
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

function clampScoreInput(v) {
  if (v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  if (n < 0) return "0";
  if (n > 10) return "10";
  return String(Math.trunc(n));
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 12,
        border: "1px solid #ddd",
        background: active ? "#f3f3f3" : "white",
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
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

  const parsedSkip = skip === "" ? null : Number(skip);
  const parsedKiff = kiff === "" ? null : Number(kiff);

  const score = useMemo(
    () => computedScore(parsedSkip, parsedKiff, special, flou),
    [parsedSkip, parsedKiff, special, flou]
  );

  async function loadCurrentRating(gid) {
    const r = await getRating(gid);
    setSkip(r?.skip == null ? "" : String(r.skip));
    setKiff(r?.kiff == null ? "" : String(r.kiff));
    setSpecial(!!r?.special);
    setFlou(!!r?.flou);
    setComment(r?.comment ?? "");
  }

  async function refreshAllRatings() {
    const rs = await getAllRatings();
    setAllRatings(rs);
  }

  useEffect(() => {
    (async () => {
      const text = await fetch("./genres.txt").then((r) => r.text());
      const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
      setGenres(lines);

      const savedIdx = (await getMeta("idx")) ?? 0;
      const i = Math.max(0, Math.min(savedIdx, lines.length - 1));
      setIdx(i);
      setGenreId(i);

      await loadCurrentRating(i);
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
    // petite confirmation
    window.navigator?.vibrate?.(20);
  }

  async function nextGenre() {
    if (!genres.length) return;
    const ni = (idx + 1) % genres.length;
    setIdx(ni);
    setGenreId(ni);
    await setMeta("idx", ni);
    await loadCurrentRating(ni);
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

  // SEARCH results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (let i = 0; i < genres.length; i++) {
      const g = genres[i];
      if (g.toLowerCase().includes(q)) out.push([i, g]);
      if (out.length >= 200) break; // limite raisonnable
    }
    return out;
  }, [searchQuery, genres]);

  // RANK + STATS base (exclude special)
  const scoredItems = useMemo(() => {
    const items = [];
    for (const r of allRatings) {
      if (r?.special) continue; // exclu
      const sc = computedScore(r?.skip ?? null, r?.kiff ?? null, !!r?.special, !!r?.flou);
      if (sc == null) continue;
      items.push({ genreId: r.genreId, name: r.name, score: sc, flou: !!r.flou });
    }
    items.sort((a, b) => (rankOrder === "desc" ? b.score - a.score : a.score - b.score));
    return items;
  }, [allRatings, rankOrder]);

  const stats = useMemo(() => {
    let total = allRatings.length;
    let specialCount = 0;
    let eligible = 0;
    let flouCount = 0;
    let scoredCount = 0;

    const scores = [];

    for (const r of allRatings) {
      if (r?.special) {
        specialCount++;
        continue;
      }
      eligible++;
      if (r?.flou) flouCount++;
      const sc = computedScore(r?.skip ?? null, r?.kiff ?? null, !!r?.special, !!r?.flou);
      if (sc == null) continue;
      scoredCount++;
      scores.push(sc);
    }

    const avg = scoredCount ? scores.reduce((a, b) => a + b, 0) / scoredCount : null;

    // simple distribution 0..10 arrondie
    const buckets = Array.from({ length: 11 }, () => 0);
    for (const s of scores) {
      const k = Math.max(0, Math.min(10, Math.round(s)));
      buckets[k]++;
    }

    return { total, specialCount, eligible, flouCount, scoredCount, avg, buckets };
  }, [allRatings]);

  // BACKUP
  async function doExport() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `genre-rater-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImportFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    await importData(data);
    await refreshAllRatings();

    const savedIdx = (await getMeta("idx")) ?? 0;
    const i = Math.max(0, Math.min(savedIdx, genres.length - 1));
    setIdx(i);
    setGenreId(i);
    await loadCurrentRating(i);
    alert("Import terminé ✅");
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h2 style={{ marginBottom: 8 }}>🎧 Genre Rater</h2>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <TabButton active={tab === "next"} onClick={() => setTab("next")}>Next</TabButton>
        <TabButton active={tab === "search"} onClick={() => setTab("search")}>Search</TabButton>
        <TabButton active={tab === "rank"} onClick={() => setTab("rank")}>Rank</TabButton>
        <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>Stats</TabButton>
        <TabButton active={tab === "backup"} onClick={() => setTab("backup")}>Backup</TabButton>
      </div>

      {tab === "next" && (
        <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {genreName || "Chargement..."}
            {genreName && <span style={{ fontWeight: 500, fontSize: 14, marginLeft: 10, color: "#666" }}>#{genreId}</span>}
          </div>

          {url && (
            <div style={{ marginTop: 6 }}>
              <a href={url} target="_blank" rel="noreferrer">{url}</a>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <label style={{ flex: 1 }}>
              Skip (0–10)
              <input
                value={skip}
                onChange={(e) => setSkip(clampScoreInput(e.target.value))}
                inputMode="numeric"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>
            <label style={{ flex: 1 }}>
              Kiff (0–10)
              <input
                value={kiff}
                onChange={(e) => setKiff(clampScoreInput(e.target.value))}
                inputMode="numeric"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} />
              Special (exclu)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={flou} onChange={(e) => setFlou(e.target.checked)} />
              Flou (0.35/0.65)
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <label>
              Commentaire
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>
          </div>

          <div style={{ marginTop: 12, fontWeight: 800 }}>
            Note calculée :{" "}
            {special ? "— (exclu)" : score == null ? "—" : score.toFixed(2)}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button
              onClick={saveCurrent}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 700 }}
            >
              Enregistrer
            </button>
            <button
              onClick={async () => {
                await saveCurrent();
                await nextGenre();
              }}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 700 }}
            >
              Enregistrer + Next ➜
            </button>
          </div>
        </div>
      )}

      {tab === "search" && (
        <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Recherche</div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tape un mot…"
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
          />

          <div style={{ marginTop: 12, color: "#666" }}>
            {searchQuery.trim() ? `${searchResults.length} résultat(s) (limite 200)` : "—"}
          </div>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {searchResults.slice(0, 50).map(([id, name]) => (
              <button
                key={id}
                onClick={() => openGenreById(id)}
                style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #eee" }}
              >
                <b>#{id}</b> — {name}
              </button>
            ))}
            {searchResults.length > 50 && (
              <div style={{ color: "#666" }}>
                Affiche les 50 premiers (pour éviter de surcharger).
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "rank" && (
        <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Classement</div>
            <select
              value={rankOrder}
              onChange={(e) => setRankOrder(e.target.value)}
              style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
            >
              <option value="desc">Décroissant (meilleurs)</option>
              <option value="asc">Croissant (pires)</option>
            </select>
          </div>

          <div style={{ marginTop: 10, color: "#666" }}>
            {scoredItems.length} genre(s) classés (Special exclus, Skip+Kiff requis)
          </div>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {scoredItems.slice(0, 100).map((it, i) => (
              <button
                key={it.genreId}
                onClick={() => openGenreById(it.genreId)}
                style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #eee" }}
              >
                <b>#{i + 1}</b> — <b>{it.score.toFixed(2)}</b> — <span style={{ color: "#666" }}>#{it.genreId}</span> {it.name}
                {it.flou && <span style={{ marginLeft: 8, color: "#999" }}>(flou)</span>}
              </button>
            ))}
            {scoredItems.length > 100 && (
              <div style={{ color: "#666" }}>
                Affiche les 100 premiers (pour perf). On pourra ajouter pagination si tu veux.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "stats" && (
        <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Stats</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 12 }}>
              <div style={{ color: "#666" }}>Entrées totales</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{stats.total}</div>
            </div>
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 12 }}>
              <div style={{ color: "#666" }}>Special (exclus)</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{stats.specialCount}</div>
            </div>
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 12 }}>
              <div style={{ color: "#666" }}>Pris en compte</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{stats.eligible}</div>
            </div>
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 12 }}>
              <div style={{ color: "#666" }}>Classés (score ok)</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{stats.scoredCount}</div>
            </div>
          </div>

          <div style={{ marginTop: 12, padding: 10, border: "1px solid #eee", borderRadius: 12 }}>
            <div style={{ color: "#666" }}>Moyenne note calculée</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {stats.avg == null ? "—" : stats.avg.toFixed(2)}
            </div>
            <div style={{ color: "#666", marginTop: 6 }}>
              Flou cochés (dans non Special) : {stats.flouCount}
            </div>
          </div>

          <div style={{ marginTop: 12, padding: 10, border: "1px solid #eee", borderRadius: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Distribution (arrondi 0–10)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 6 }}>
              {stats.buckets.map((n, i) => (
                <div key={i} style={{ textAlign: "center", padding: 6, border: "1px solid #f0f0f0", borderRadius: 10 }}>
                  <div style={{ fontWeight: 800 }}>{i}</div>
                  <div style={{ color: "#666" }}>{n}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "backup" && (
        <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Backup</div>
          <div style={{ color: "#666", marginBottom: 12 }}>
            Tes notes sont sur ton téléphone. Fais un export de temps en temps pour éviter toute perte (changement de tel, reset navigateur, etc.).
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <button
              onClick={doExport}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 700 }}
            >
              Export JSON
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 700 }}
            >
              Import JSON
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await doImportFile(file);
                } catch (err) {
                  alert("Import échoué : " + (err?.message ?? String(err)));
                } finally {
                  e.target.value = "";
                }
              }}
            />
          </div>

          <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 12, color: "#666" }}>
            Astuce : après export, envoie le fichier dans ton cloud (Drive/iCloud) ou à toi-même.
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, color: "#999", fontSize: 12 }}>
        Offline OK • Données stockées sur l’appareil • Special exclu du rank/stats
      </div>
    </div>
  );
}import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
