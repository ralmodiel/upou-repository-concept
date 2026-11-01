import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchArticles } from "./engine.js";
import { pref, allow } from "./consent.js";
import { suggest } from "./suggest.js";
import { parseBool, matchBool, toChips } from "./boolq.js";
import { hayOf, countLine } from "./query.js";
import { AdvIntro, ExportBtns, Icon, Link, Pub, Card, AddBtn, ViewToggle, ResultCollections, colKey } from "./App.jsx";

// ---- the query (four areas of filter chips), shared with the Maps page and kept in localStorage ----
export const AREAS = [
  ["req", "Required", "all must match"],
  ["boost", "Boost", "a copy: the filter stays in its area; H ranks above L, first listed most"],
  ["exp", "Expand", "also include any of these"],
  ["exc", "Exclude", "none of these"],
];
const KIND = { category: "CATEGORY", subtopic: "SUB-TOPIC", tag: "TAG", author: "AUTHOR", collection: "COLLECTION", year: "YEAR", pub: "ITEM", words: "WORDS" };
const empty = () => ({ req: [], boost: [], exp: [], exc: [] });
// stored value is untrusted: keep only {k, v} string chips, at most 50 per area
// (a shared link too): known kinds and string fields only, at most 50 chips per area
const clean = (v) => Object.fromEntries(AREAS.map(([k]) => [k, (Array.isArray(v?.[k]) ? v[k] : []).filter((c) => c && Object.hasOwn(KIND, c.k) && typeof c.v === "string").slice(0, 50)
  .map((c) => ({ k: c.k, v: c.v.slice(0, 200), l: String(c.l ?? c.v).slice(0, 200), ...(c.h === "L" || c.h === "H" ? { h: c.h } : {}) }))]));
const load = () => { try { return clean(JSON.parse(pref.get("upou-adv") || "{}")); } catch { return empty(); } };
// past/future: [{ a: areas before/after the step, m: what the step did }] for Undo/Redo and the History list
let adv = { areas: load(), past: [], future: [] }, note = "", noteUndo = false;
// how Expand applies: "any" widens Required with its filters, "one" needs at least one of them (the area then reads "Additional")
let mode = (() => { try { return pref.get("upou-adv-mode") === "one" ? "one" : "any"; } catch { return "any"; } })();
export const setMode = (m) => { mode = m; try { pref.set("upou-adv-mode", m); } catch { /* private mode */ } subs.forEach((f) => f()); };
const subs = new Set();
const commit = (areas, msg = "", label = msg, big = false) => { if (JSON.stringify(areas) === JSON.stringify(adv.areas)) return; // a no-op step (same chip again) adds no History entry and no write
  adv = { areas, past: [...adv.past, { a: adv.areas, m: label || "Edit" }].slice(-30), future: [] }; note = msg; noteUndo = big; save(); };
const save = () => { try { pref.set("upou-adv", JSON.stringify(adv.areas)); } catch { /* private mode */ } subs.forEach((f) => f()); };
export const useAdv = () => {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return { ...adv, note, noteUndo, mode };
};
const same = (a, b) => a.k === b.k && a.v === b.v;
// Boost keeps its chips in the other areas (they stay in effect) and is ordered: High (H) chips first, then Low (L).
// A chip dropped above an H becomes H, below an L becomes L; between H and L it keeps its own level.
const boostAt = (list, chip, idx) => {
  const own = list.find((c) => same(c, chip)), rest = list.filter((c) => !same(c, chip)), i = Math.max(0, Math.min(idx ?? rest.length, rest.length));
  const h = rest[i - 1]?.h === "L" ? "L" : rest[i]?.h !== "L" && rest[i] ? "H" : (own || chip).h === "L" ? "L" : "H";
  return [...rest.slice(0, i), { ...chip, h }, ...rest.slice(i)];
};
export const addChip = (area, chip, idx, from) => {
  if (area === "boost") {
    const areas = { ...adv.areas, boost: boostAt(adv.areas.boost, chip, idx) };
    if (chip.k === "category" && !areas.req.some((c) => same(c, chip)) && !areas.exp.some((c) => same(c, chip))) areas.exp = [...areas.exp, chip]; // a category only boosts if it is also a filter
    return commit(areas, adv.areas.boost.some((c) => same(c, chip)) ? "" : `${chip.l} also boosts (its other filters stay)`);
  }
  const hadIn = AREAS.find(([k]) => adv.areas[k].some((c) => same(c, chip)));
  if (hadIn && hadIn[0] === area) return;
  // a Boost entry survives a move between filter areas (the filter stays in effect); moving out of Boost itself drops it
  const areas = Object.fromEntries(AREAS.map(([k]) => [k, k === "boost" && from !== "boost" ? adv.areas[k] : adv.areas[k].filter((c) => !same(c, chip))]));
  areas[area] = [...areas[area], chip];
  const to = AREAS.find(([k]) => k === area)[1]; commit(areas, hadIn ? `${chip.l} moved to ${to}` : "", hadIn ? `${chip.l} moved to ${to}` : `Added ${chip.l} to ${to}`);
};
const setLevel = (chip) => commit({ ...adv.areas, boost: adv.areas.boost.map((c) => same(c, chip) ? { ...c, h: c.h === "L" ? "H" : "L" } : c).sort((a, b) => (a.h === "L") - (b.h === "L")) }, `${chip.l}: ${chip.h === "L" ? "high" : "low"} boost`);
// keyboard reorder in Boost (Alt+Arrow on a chip): same H/L rules as a drop at that place
const nudge = (chip, d) => { const b = adv.areas.boost, i = b.findIndex((c) => same(c, chip)), j = i + d; if (i < 0 || j < 0 || j >= b.length) return; const nb = boostAt(b, chip, j); commit({ ...adv.areas, boost: nb }, `${chip.l} is now ${nb.findIndex((c) => same(c, chip)) + 1} of ${nb.length} in Boost (${nb.find((c) => same(c, chip)).h === "L" ? "low" : "high"})`); };
// removing from Boost only un-boosts; removing a filter elsewhere also removes it from Boost
const removeChip = (chip, area) => commit(Object.fromEntries(AREAS.map(([k]) => [k, area === "boost" && k !== "boost" ? adv.areas[k] : adv.areas[k].filter((c) => !same(c, chip))])), "", `Removed ${chip.l}`);
export const undo = (n = 1) => { const m = adv.past.at(-n)?.m; while (n-- > 0 && adv.past.length) { const e = adv.past.at(-1); adv = { areas: e.a, past: adv.past.slice(0, -1), future: [{ a: adv.areas, m: e.m }, ...adv.future] }; } note = m ? `Undone: ${m}` : ""; noteUndo = false; save(); };
const redo = () => { if (adv.future.length) { const e = adv.future[0]; adv = { areas: e.a, past: [...adv.past, { a: adv.areas, m: e.m }], future: adv.future.slice(1) }; note = ""; save(); } };
const swapAreas = (a, b) => {
  const nm = (k) => AREAS.find(([x]) => x === k)[1], moved = adv.areas[a].length + adv.areas[b].length;
  if (moved) commit({ ...adv.areas, [a]: adv.areas[b], [b]: adv.areas[a] }, `${nm(a)} and ${nm(b)} swapped: ${moved} filter${moved === 1 ? "" : "s"} moved`);
};
// Round button on the edge between two neighbouring areas (wide layout only): it sits on the lower or right-hand area
function Swap({ a, b, dir }) {
  const nm = (k) => AREAS.find(([x]) => x === k)[1], label = `Swap the filters of ${nm(a)} and ${nm(b)}`, { areas } = useAdv();
  const place = dir === "v" ? "left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(50%+8px)]" : "left-0 top-1/2 -translate-x-[calc(50%+8px)] -translate-y-1/2";
  return <button type="button" title={label} aria-label={label} disabled={!areas[a].length && !areas[b].length} onClick={() => swapAreas(a, b)} className={`absolute z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-3 shadow-sm hover:border-action hover:text-action disabled:opacity-40 lg:inline-flex ${place}`}>
    <Icon m={dir === "v" ? "swapV" : "swapH"} w={2} className="h-4 w-4" /></button>;
}
const clearAll = () => { const n = chipCount(adv.areas); commit(empty(), `Cleared ${n} filter${n === 1 ? "" : "s"}.`, `Cleared ${n} filters`, true); };
// Worked example: one real value per area (most common tag, next tag, most common category, oldest year)
// Share an Advanced search by URL: the four areas and the Expand mode, deflated and base64url-coded into #/advanced/s/<code>
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const pipe = async (u8, t) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(t)).arrayBuffer());
const shareCode = async () => b64(await pipe(new TextEncoder().encode(JSON.stringify({ ...adv.areas, m: mode })), new CompressionStream("deflate-raw")));
const openShared = async (code) => {
  try { if (code.length > 8000) throw 0; const out = await pipe(unb64(code), new DecompressionStream("deflate-raw")); if (out.length > 100000) throw 0;
    const v = JSON.parse(new TextDecoder().decode(out)); if (v?.m === "one" || v?.m === "any") setMode(v.m);
    commit(clean(v), "Opened a shared search. Undo goes back to your own.", "Opened a shared search", true);
  } catch { note = "That share link is broken or too long."; noteUndo = false; subs.forEach((f) => f()); }
  history.replaceState(null, "", "#/advanced");
};
// The Topic Planner's #/advanced?query=…&from=&to=: the Boolean string becomes chips (toChips), years outside the range
// become Exclude year chips, and the note gives the string's own count (the Boolean predicate over every item).
const openQuery = async ({ q, from, to }) => {
  const S = window.__S, b = parseBool(q), ys = [...new Set(S.articles.map((a) => +a.year))].sort((x, y) => x - y);
  const [y1, y2] = [from || ys[0], to || ys.at(-1)].sort((x, y) => x - y), areas = { ...empty(), ...toChips(b.ast) };
  areas.exc = [...areas.exc, ...ys.filter((y) => y < y1 || y > y2).map((y) => ({ k: "year", v: String(y), l: String(y) }))];
  await Promise.all([S.textsP, S.half()]);
  const n = S.articles.filter((a) => +a.year >= y1 && +a.year <= y2 && matchBool(b.ast, hayOf(a))).length;
  commit(clean(areas), `${countLine(n, q, y1, y2)}. The chips show how the search was read: edit them to refine it.${b.note ? " " + b.note : ""}`, "Opened a planner search", true);
};
export const chipCount = (areas) => AREAS.reduce((n, [k]) => n + areas[k].length, 0);

// ---- what each chip matches ----
const hit = (c, a, words) => c.k === "category" ? a.categories.includes(c.v) : c.k === "subtopic" ? a.subtopics.includes(c.v) : c.k === "tag" ? a.subjects.includes(c.v) : c.k === "author" ? a.authors.includes(c.v)
  : c.k === "collection" ? colKey(a) === c.v : c.k === "year" ? String(a.year) === c.v : c.k === "pub" ? a.id === c.v : words.get(c.v)?.has(a.id);
const colLabel = (k) => window.__S.articles.find((a) => colKey(a) === k)?.collection || k;

function facets() {
  const S = window.__S, n = (get) => { const m = new Map(); S.articles.forEach((a) => get(a).forEach((v) => m.set(v, (m.get(v) || 0) + 1))); return [...m].map(([v, c]) => ({ v, c })).sort((x, y) => y.c - x.c || String(x.v).localeCompare(String(y.v))); };
  return {
    category: n((a) => a.categories).map((f) => ({ ...f, l: f.v })),
    subtopic: n((a) => a.subtopics).map((f) => ({ ...f, l: f.v })),
    tag: n((a) => a.subjects).map((f) => ({ ...f, l: f.v })),
    author: n((a) => a.authors).map((f) => ({ ...f, l: f.v })),
    collection: n((a) => [colKey(a)]).map((f) => ({ ...f, l: colLabel(f.v) })),
    year: n((a) => [String(a.year)]).map((f) => ({ ...f, l: f.v })).sort((x, y) => y.v - x.v),
  };
}

// ---- the result set: Required AND, plus Expand OR, minus Exclude, ordered by Boost and word relevance ----
function run(areas, words, mode) {
  const all = window.__S.articles, m = (list, a) => list.map((c) => hit(c, a, words));
  const hasReq = areas.req.length > 0, hasExp = areas.exp.length > 0;
  const rel = new Map(); // a Boost chip also sits in its own area: count each words chip once
  new Set([...areas.req, ...areas.exp, ...areas.boost].filter((c) => c.k === "words").map((c) => c.v)).forEach((v) => words.get(v)?.forEach((r, id) => rel.set(id, (rel.get(id) || 0) + r)));
  let viaExpand = 0, strict = 0;
  const rows = [];
  for (const a of all) {
    if (areas.exc.some((c) => hit(c, a, words))) continue;
    const r = hasReq && m(areas.req, a).every(Boolean), e = hasExp && m(areas.exp, a).some(Boolean);
    if (mode === "one" ? (hasReq && !r) || (hasExp && !e) : hasReq || hasExp ? !(r || e) : false) continue;
    if (r) strict++; else if (e) viaExpand++;
    const boost = areas.boost.reduce((s, c, i) => s + (hit(c, a, words) ? (c.h === "L" ? 0 : 100) + areas.boost.length - i : 0), 0);
    const why = [...areas.req.filter((c) => hit(c, a, words)).map((c) => "Required: " + c.l), ...areas.exp.filter((c) => hit(c, a, words)).map((c) => (mode === "one" ? "Additional: " : "Expand: ") + c.l),
      ...areas.boost.map((c, i) => hit(c, a, words) && `Boost ${c.h === "L" ? "low" : "high"} (#${i + 1}): ${c.l}`).filter(Boolean), ...(rel.get(a.id) ? [`Words relevance ${rel.get(a.id).toFixed(2)}`] : [])];
    const ps = [...new Set([...areas.req, ...areas.exp, ...areas.boost].filter((c) => c.k === "words").map((c) => c.v))].map((v) => words.get(v)?.passages?.get(a.id)).filter(Boolean);
    rows.push({ ...a, why, score: boost * 10 + (rel.get(a.id) || 0), matched: [], passage: ps[0], npass: ps.length });
  }
  return { rows, strict: hasReq ? strict : rows.length, viaExpand: mode === "one" ? 0 : viaExpand };
}

const SORTS = { relevance: "Relevance", new: "Newest first", old: "Oldest first", title: "Title A–Z" };
const sorter = { relevance: (x, y) => y.score - x.score || y.year - x.year, new: (x, y) => y.year - x.year, old: (x, y) => x.year - y.year, title: (x, y) => x.title.localeCompare(y.title) };


// Details view: this item's own categories, tags, authors, collection and year that no area holds yet, as draggable chips
function Fit({ a, areas }) {
  const held = (k, v) => AREAS.some(([x]) => areas[x].some((c) => c.k === k && c.v === v));
  const all = [{ k: "pub", v: a.id, l: a.title.length > 50 ? a.title.slice(0, 49) + "…" : a.title }, ...a.categories.map((v) => ({ k: "category", v, l: v })), ...a.subtopics.map((v) => ({ k: "subtopic", v, l: v })), { k: "collection", v: colKey(a), l: a.collection }, { k: "year", v: String(a.year), l: String(a.year) }, ...a.authors.map((v) => ({ k: "author", v, l: v })), ...a.subjects.map((v) => ({ k: "tag", v, l: v }))]; // tags last: the list is cut at 12
  const free = all.filter((c) => !held(c.k, c.v)).slice(0, 12);
  if (!free.length) return null;
  return <div aria-label="Filters you can add from this item" className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-2xs font-bold uppercase tracking-wide text-ink-3">Drag to a filter</span>{free.map((c) => <span key={c.k + c.v} draggable onDragStart={dragData(c)} title={KIND[c.k] + ": click to add to Expand, or drag"} className="inline-flex max-w-full cursor-grab items-center rounded-full border border-dashed border-action-2/50 bg-surface py-0.5 pl-2.5 pr-0.5 text-xs"><button type="button" onClick={() => addChip("exp", c)} className="line-clamp-1 min-h-7 text-left">{c.l}</button><AddTo c={c} /></span>)}</div>;
}
// The chips this result matched, in the order the score weighs them (Boost high > low, then words).
function Why({ a }) {
  const hits = a.why.filter((w) => !w.startsWith("Words relevance"));
  return <>{(hits.length > 0 || a.npass > 0) && <p aria-label="Matched filters" data-matched className="flex flex-wrap gap-1 px-3 pt-2 text-2xs">{hits.slice(0, 4).map((w) => <span key={w} className="rounded-full bg-navy-soft px-2 py-0.5 text-navy">{w.replace(/ \(#\d+\)/, "")}</span>)}{hits.length > 4 && <span className="py-0.5 text-ink-3">+{hits.length - 4} more</span>}
    {a.npass > 0 && <span className="rounded-full bg-crimson-soft px-2 py-0.5 text-link">{a.npass} matched passage{a.npass === 1 ? "" : "s"}</span>}</p>}</>;
}
const dragData = (c) => (e) => { e.dataTransfer.setData("text/chip", JSON.stringify(c)); e.dataTransfer.effectAllowed = "copyMove"; };
// the keyboard alternative to dragging c onto an area (R275): every draggable carries its own
const AddTo = ({ c }) => <select aria-label={`Add ${c.l} to…`} value="" onChange={(e) => addChip(e.target.value, c)} title="Add to…" className="h-7 w-7 cursor-pointer appearance-none rounded-full bg-transparent text-center text-ink-3 hover:bg-navy-soft"><option value="" disabled hidden>＋</option>{AREAS.map(([k, nm]) => <option key={k} value={k}>{nm}</option>)}</select>;
const pubChip = (a) => ({ k: "pub", v: a.id, l: a.title }), toArea = (a) => <p className="flex items-center justify-end gap-1 px-3 pb-1.5 text-2xs text-ink-3">Add to a filter <AddTo c={pubChip(a)} /></p>;
const kindTag = (k) => <span className="mr-1.5 text-2xs font-bold uppercase tracking-wide opacity-60">{KIND[k]}</span>;
function ChipEl({ c, area, mark }) {
  return (
    <span draggable data-chip onDragStart={(e) => e.dataTransfer.setData("text/chip", JSON.stringify(c))} onKeyDown={area === "boost" ? (e) => { const d = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key]; if (e.altKey && d) { e.preventDefault(); nudge(c, d); } } : undefined} aria-keyshortcuts={area === "boost" ? "Alt+ArrowUp Alt+ArrowDown" : undefined} className={`inline-flex max-w-full cursor-grab items-center rounded-full border border-action-2/40 bg-navy-soft py-1 pl-3 pr-1 text-sm text-ink ${mark ? "shadow-[-3px_0_0_0_#c2410c]" : ""}`}>
      {kindTag(c.k)}<span className="line-clamp-1">{c.l}</span>
      {area === "boost" && <button type="button" onClick={() => setLevel(c)} aria-label={`${c.l}: boost ${c.h === "L" ? "low" : "high"}, switch to ${c.h === "L" ? "high" : "low"}`} title={(c.h === "L" ? "Low boost: click for High" : "High boost: click for Low") + ". Alt+arrow keys reorder"} className={`ml-1.5 h-6 w-6 rounded-full text-xs font-bold ${c.h === "L" ? "bg-surface text-ink-3" : "bg-action-fill text-white"}`}>{c.h === "L" ? "L" : "H"}</button>}
      <select aria-label={`Move ${c.l} to another area`} value="" onChange={(e) => addChip(e.target.value, c, undefined, area)} className="ml-1 h-7 w-7 cursor-pointer appearance-none rounded-full bg-transparent text-center text-ink-3 hover:bg-surface" title="Move to…"><option value="" disabled hidden>⇄</option>{AREAS.filter(([k]) => k !== area).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      <button type="button" onClick={() => removeChip(c, area)} aria-label={`Remove ${c.l}`} className="h-7 w-7 rounded-full text-ink-3 hover:bg-surface hover:text-link">×</button>
    </span>
  );
}

function Area({ id, name, hint, chips, F, onLookup, diff }) {
  const { mode } = useAdv();
  const [q, setQ] = useState(""), [over, setOver] = useState(false), [at, setAt] = useState(null), box = useRef(null);
  // where in the Boost list the pointer is: the number of chips that come before it in reading order
  const slot = (e) => { const r = [...(box.current?.querySelectorAll("[data-chip]") || [])].map((el) => el.getBoundingClientRect()); return r.filter((b) => b.bottom < e.clientY || (b.top <= e.clientY && b.left + b.width / 2 < e.clientX)).length; };
  const opts = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const out = [];
    for (const k of ["category", "subtopic", "tag", "author", "collection", "year"]) for (const f of F[k]) if (f.l.toLowerCase().includes(t) && out.filter((o) => o.k === k).length < 3) out.push({ k, v: f.v, l: f.l });
    return [...out.slice(0, 8), { k: "words", v: q.trim(), l: q.trim() }];
  }, [q, F]);
  const add = (c) => { addChip(id, c); setQ(""); };
  // while a chip is being dragged, a cover sits over the area so inputs and buttons can't swallow the drop
  const [drag, setDrag] = useState(false);
  useEffect(() => {
    const on = (e) => { const chip = e.dataTransfer?.types?.includes("text/chip"); if (chip) setTimeout(() => setDrag(true), 0); }, // deferred: changing the DOM inside dragstart cancels the drag
       off = () => { setDrag(false); setOver(false); setAt(null); };
    document.addEventListener("dragstart", on); document.addEventListener("dragend", off); document.addEventListener("drop", off);
    return () => { document.removeEventListener("dragstart", on); document.removeEventListener("dragend", off); document.removeEventListener("drop", off); };
  }, []);
  return (
    <div onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); if (id === "boost") setAt(slot(e)); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }} onDrop={(e) => { e.preventDefault(); setOver(false); setAt(null); try { addChip(id, JSON.parse(e.dataTransfer.getData("text/chip")), id === "boost" ? slot(e) : undefined); } catch { /* not a chip */ } }}
      className={`relative min-h-28 rounded-xl border p-3 ${id === "exc" ? "border-dashed" : ""} ${over ? "border-action bg-navy-soft" : "border-line bg-surface"}`}>
      {drag && <div aria-hidden="true" className={`absolute inset-0 z-30 grid place-items-center rounded-xl border-2 border-dashed text-sm font-bold ${over ? "border-action bg-navy-soft/90 text-navy" : "border-action/40 bg-surface/60 text-ink-3"}`}>Drop to add to {name}</div>}
      {id === "exp" && <Swap a="req" b="exp" dir="v" />}{id === "exc" && <Swap a="exp" b="exc" dir="h" />}
      <div className="flex items-baseline justify-between gap-2"><h2 className="font-serif text-lg">{id === "exp" && mode === "one" ? "Additional" : name}</h2>{id === "exp" ? <select aria-label="How the Expand filters apply" value={mode} onChange={(e) => setMode(e.target.value)} className="mr-auto ml-1 min-h-8 rounded-md border border-line bg-surface px-1 text-xs text-ink-2"><option value="one">at least one of these</option><option value="any">include any of these</option></select> : <span className="text-xs text-ink-3">{hint}</span>}</div>
      <div ref={box} className="mt-2 flex min-h-8 flex-wrap gap-1.5">{chips.length ? chips.map((c, i) => <ChipEl key={c.k + c.v} c={c} area={id} mark={id === "boost" && at === i} />) : <span className="text-sm text-ink-3">Empty: type below, use ⇄ or ＋ on a chip, or drop one here</span>}</div>
      <form className="relative mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (q.trim()) add(opts[0] || { k: "words", v: q.trim(), l: q.trim() }); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Topic, author, collection, year or words" aria-label={`Add to ${name}`} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-base" />
        <button className="min-h-10 rounded-md bg-navy-soft px-3 text-sm text-navy hover:bg-sky">Add</button>
        <button type="button" onClick={() => onLookup(id)} aria-label={`Find filters for ${name}`} title="Find filters" className="grid min-h-10 w-10 place-items-center rounded-md bg-navy-soft text-navy hover:bg-sky"><Icon m="filter" w={2} className="h-5 w-5" /></button>
        {opts.length > 0 && <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-xl">{opts.map((o) => <li key={o.k + o.v}><button type="button" onClick={() => add(o)} className="flex min-h-10 w-full items-baseline gap-2 px-3 text-left text-sm hover:bg-navy-soft"><span className="w-16 shrink-0 text-2xs font-bold uppercase text-ink-3">{o.k === "words" ? "words" : KIND[o.k]}</span><span className="line-clamp-1">{o.l}</span></button></li>)}</ul>}
      </form>
    </div>
  );
}

// The lookup popup: browse every facet value and send it to any area.
function Lookup({ F, area, close }) {
  const [drag, setDrag] = useState(false), [to, setTo] = useState(area), [k, setK] = useState("category"), [q, setQ] = useState(""), { areas } = useAdv();
  useEffect(() => { const f = (e) => e.key === "Escape" && close(); addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, []);
  const list = F[k].filter((f) => f.l.toLowerCase().includes(q.toLowerCase())).slice(0, 120);
  const inArea = (f) => AREAS.find(([a]) => areas[a].some((c) => c.k === k && c.v === f.v))?.[1];
  return createPortal(
    <div className={`fixed inset-0 z-50 grid place-items-center p-3 transition ${drag ? "pointer-events-none" : "bg-ink-fill/50"}`} onClick={close}>
      <div role="dialog" aria-modal="true" aria-label="Find filters" onClick={(e) => e.stopPropagation()} className={`flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-surface shadow-2xl transition ${drag ? "opacity-0" : ""}`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4"><h2 className="font-serif text-xl">Find filters</h2><span className="text-xs text-ink-3">click to add, or drag onto an area</span>
          <label className="ml-auto flex items-center gap-2 text-sm">Add to <select value={to} onChange={(e) => setTo(e.target.value)} className="min-h-10 rounded-md border border-line px-2 text-base">{AREAS.map(([a, n]) => <option key={a} value={a}>{n}</option>)}</select></label>
          <button type="button" onClick={close} className="min-h-10 rounded-md bg-action-fill px-4 font-bold text-white">Done</button></div>
        <div className="flex flex-wrap gap-2 px-4 pt-3" role="tablist">{Object.keys(F).map((x) => <button key={x} type="button" role="tab" aria-selected={k === x} onClick={() => setK(x)} className={`min-h-10 rounded-full border px-4 text-sm capitalize ${k === x ? "border-action bg-action-fill text-white" : "border-line text-ink-2 hover:border-action-2"}`}>{x === "collection" ? "Collection" : x === "category" ? "Category" : x === "subtopic" ? "Sub-topic" : x}</button>)}</div>
        <div className="px-4 pt-3"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${k} values`} aria-label="Filter values" className="w-full rounded-md border border-line px-3 py-2 text-base" /></div>
        <ul className="mt-2 flex-1 overflow-y-auto p-2">{list.map((f) => { const at = inArea(f); return <li key={f.v} draggable onDragStart={(e) => { dragData({ k, v: f.v, l: f.l })(e); setTimeout(() => setDrag(true), 0); }} onDragEnd={() => setDrag(false)}><button type="button" onClick={() => addChip(to, { k, v: f.v, l: f.l })} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-navy-soft"><span className="line-clamp-1">{f.l}</span>{at && <span className="rounded-full bg-crimson-soft px-2 text-xs text-link">{at}</span>}<span className="ml-auto text-xs text-ink-3">{f.c}</span></button></li>; })}
          {list.length === 0 && <li className="p-4 text-center text-ink-3">Nothing matches.</li>}</ul>
      </div>
    </div>, document.body);
}

export function Advanced({ share, entry }) {
  const { areas, past, future, note, noteUndo, mode } = useAdv(), F = useMemo(facets, []);
  const [words, setWords] = useState(new Map()), [lookup, setLookup] = useState(null), [sort, setSort] = useState("relevance"), [view, setView] = useState("grid"), [qa, setQa] = useState("off"), [shown, setShown] = useState(24), [skip, setSkip] = useState([]);
  const cache = useRef(new Map()), [link, setLink] = useState("");
  useEffect(() => { if (share) openShared(share); }, [share]);
  useEffect(() => { if (entry) openQuery(entry); }, [entry?.q]);
  // without the prefs consent the setup lives in memory only: warn before a reload or close loses a long one
  useEffect(() => { const f = (e) => { if (!allow("prefs") && chipCount(adv.areas) >= 5) e.preventDefault(); }; addEventListener("beforeunload", f); return () => removeEventListener("beforeunload", f); }, []);
  // The address bar always holds the current search (replaceState: no history entry, no route change), so the page URL is the share link.
  const seen = useRef(false);
  useEffect(() => {
    if (chipCount(areas)) seen.current = true;
    if ((share || entry) && !seen.current) return; // a shared link (or a planner query) is still being opened; once chips have shown, an empty list means the user cleared them
    let off = false;
    (async () => { const h = chipCount(areas) ? "#/advanced/s/" + await shareCode() : "#/advanced"; if (!off && location.hash.startsWith("#/advanced") && location.hash !== h) history.replaceState(null, "", location.href.split("#")[0] + h); })();
    return () => { off = true; };
  }, [areas, mode]);
  useEffect(() => { if (!link) return; const t = setTimeout(() => setLink(""), 5000); return () => clearTimeout(t); }, [link]);
  const copyShare = async () => { const url = location.href.split("#")[0] + "#/advanced/s/" + await shareCode(); try { await navigator.clipboard.writeText(url); setLink("copied"); } catch { setLink("manual:" + url); } };
  // Ctrl/Cmd+Z undoes and Ctrl+Shift+Z / Ctrl+Y redoes, except while typing in a field (the field's own undo wins)
  useEffect(() => { const f = (e) => { if (!(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const k = e.key.toLowerCase(); if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); } }; addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, []);
  const wordsKey = [...areas.req, ...areas.exp, ...areas.boost, ...areas.exc].filter((c) => c.k === "words").map((c) => c.v).join("|");
  useEffect(() => {
    let live = true;
    Promise.all(wordsKey.split("|").filter(Boolean).map(async (v) => {
      if (!cache.current.has(v)) {
        // a chip with Boolean syntax ("exact phrase", prefix*, OR, NOT) matches by the Boolean predicate over every item; plain words as before
        const r0 = await searchArticles(v.slice(0, 300), { k: 200 }), b = parseBool(v), keep = b.plain ? null : new Set(window.__S.articles.filter((a) => matchBool(b.ast, hayOf(a))).map((a) => a.id));
        const r = r0.filter((a) => keep ? keep.has(a.id) : a.matched.length), m = new Map(r.map((a, i) => [a.id, 1 - i / Math.max(r.length, 1)]));
        keep?.forEach((id) => m.has(id) || m.set(id, 0));
        cache.current.set(v, Object.assign(m, { passages: new Map(r.filter((a) => a.passage).map((a) => [a.id, a.passage])) })); }
      return [v, cache.current.get(v)];
    })).then((e) => live && setWords(new Map(e)));
    return () => { live = false; };
  }, [wordsKey]);
  useEffect(() => setShown(24), [areas, sort]);
  const { rows, strict, viaExpand } = useMemo(() => run(areas, words, mode), [areas, words, mode]);
  const list = useMemo(() => [...rows].sort(sorter[sort]), [rows, sort]);
  // live effect of each area: the result count (or, for Boost, the top result) without it
  const diffs = useMemo(() => Object.fromEntries(AREAS.filter(([k]) => areas[k].length).map(([k]) => { const r = run({ ...areas, [k]: [] }, words, mode).rows;
    if (k !== "boost") return [k, `Now ${rows.length} items; without this area ${r.length}.`];
    const top = (l) => [...l].sort(sorter.relevance)[0]?.title || "none";
    return [k, `Top result now: “${top(rows)}”; without Boost: “${top(r)}”.`]; })), [areas, words, mode, rows]);
  // What seeds the suggestions: the items the filters match, and/or the first N results as listed.
  const [sugOpen, setSugOpen] = useState(false); // phones (<640px): suggestions fold behind a button
  const [seedF, setSeedF] = useState(true), [seedR, setSeedR] = useState(true), [seedN, setSeedN] = useState(2);
  const topId = chipCount(areas) > 0 && list[0]?.id; // the logo emblem opens the map from the top result while filters are set
  useEffect(() => { window.__top = topId || null; return () => { window.__top = null; }; }, [topId]);
  const seed = useMemo(() => {
    const m = new Map();
    if (seedF) window.__S.articles.filter((a) => [...areas.req, ...areas.exp, ...areas.boost].some((c) => hit(c, a, words))).forEach((a) => m.set(a.id, a));
    if (seedR) list.slice(0, seedN).forEach((a) => m.set(a.id, a));
    return [...m.values()];
  }, [seedF, seedR, seedN, areas, words, list]);
  const used = new Set(AREAS.flatMap(([k]) => areas[k].map((c) => c.k + c.v)));
  // Best suggestions: values common in the current results and specific to them (n/total share), grouped by kind.
  const sugg = useMemo(() => {
    const glob = new Map(Object.entries(F).flatMap(([k, l]) => l.map((f) => [k + "\u0000" + f.v, f.c])));
    return suggest({ seed, glob, used, skip, nAll: window.__S.articles.length, hasChips: chipCount(areas) > 0, colLabel });
  }, [seed, areas, skip]);
  // Preview: items outside the results that carry most of the top suggestions.
  const preview = useMemo(() => {
    if (rows.length === window.__S.articles.length) return [];
    const ids = new Set(rows.map((a) => a.id)), top = sugg.flatMap(([, l]) => l.slice(0, 4));
    return window.__S.articles.filter((a) => !ids.has(a.id) && !areas.exc.some((c) => hit(c, a, words))).map((a) => { const m = top.filter((s) => hit(s, a, words)); return { a, m, n: m.length }; }).filter((x) => x.n > 0).sort((x, y) => y.n - x.n || y.a.year - x.a.year).slice(0, 5);
  }, [rows, sugg, areas, words]);
  const total = chipCount(areas), terms = [...areas.req, ...areas.exp, ...areas.boost].filter((c) => c.k === "words").flatMap((c) => c.v.toLowerCase().split(/\s+/)).filter((t) => t.length > 2);
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-serif text-3xl">Advanced search</h1>
        <button type="button" onClick={() => undo()} disabled={!past.length} aria-keyshortcuts="Control+Z" title="Undo (Ctrl+Z)" className="min-h-10 rounded-md border border-line px-3 text-sm disabled:opacity-40">↶ Undo</button>
        <button type="button" onClick={redo} disabled={!future.length} aria-keyshortcuts="Control+Shift+Z" title="Redo (Ctrl+Shift+Z or Ctrl+Y)" className="min-h-10 rounded-md border border-line px-3 text-sm disabled:opacity-40">Redo ↷</button>
        {past.length > 0 && <details className="relative"><summary className="flex min-h-10 cursor-pointer items-center rounded-md border border-line px-3 text-sm">History ({past.length})</summary>
          <ol aria-label="Undo history" className="absolute left-0 z-30 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-line bg-surface py-1 text-sm shadow-xl">{[...past].reverse().map((e, i) => <li key={past.length - i}><button type="button" onClick={() => undo(i + 1)} className="min-h-9 w-full px-3 text-left hover:bg-navy-soft">Undo “{e.m}”{i ? ` and ${i} later step${i > 1 ? "s" : ""}` : ""}</button></li>)}</ol></details>}
        <button type="button" onClick={copyShare} disabled={!total} aria-live="polite" className="min-h-10 rounded-md border border-line px-3 text-sm disabled:opacity-40">{link === "copied" ? "✓ Link copied" : "Share link"}</button>
        <button type="button" onClick={clearAll} disabled={!total} className="min-h-10 px-2 text-sm text-link hover:underline disabled:opacity-40">Clear all</button>
        <Link to="/maps" className="ml-auto min-h-10 rounded-md border border-action px-4 py-2 text-sm font-medium text-action hover:bg-navy-soft">Open the map →</Link>
      </div>
      <AdvIntro />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">{AREAS.map(([k, n, h]) => <Area key={k} id={k} name={n} hint={h} chips={areas[k]} F={F} onLookup={setLookup} diff={diffs[k]} />)}</div>
        <button type="button" aria-expanded={sugOpen} onClick={() => setSugOpen(!sugOpen)} className="min-h-11 w-full rounded-md border border-line bg-surface px-4 text-left font-bold text-ink sm:hidden">Best suggestions ({sugg.reduce((n, [, l]) => n + l.length, 0)}) {sugOpen ? "▴" : "▾"}</button>
        <aside aria-label="Best suggestions" className={`${sugOpen ? "" : "max-sm:hidden"} relative rounded-xl border border-line bg-surface`}><div className="max-h-96 overflow-y-auto p-3 lg:absolute lg:inset-0 lg:max-h-none">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-3">Best suggestions</h2><p className="mt-1 text-xs text-ink-3">Click a suggestion to add it to Expand, use ＋ to pick any area, or drag it. The number is how many of the seeding items have it; × hides it.</p>
          <div role="group" aria-label="Seed the suggestions from" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2"><span className="text-ink-3">seeded from</span>
            <label className="inline-flex min-h-7 items-center gap-1"><input type="checkbox" checked={seedF} onChange={(e) => setSeedF(e.target.checked)} />the filters</label>
            <span className="inline-flex min-h-7 items-center gap-1"><input id="seed-r" type="checkbox" checked={seedR} onChange={(e) => setSeedR(e.target.checked)} /><label htmlFor="seed-r">the first</label>
              <input type="number" min="1" max="24" value={seedN} disabled={!seedR} aria-label="How many of the first results seed suggestions" onChange={(e) => { const v = Math.round(+e.target.value); if (v >= 1 && v <= 24) setSeedN(v); }} className="w-12 rounded border border-line px-1 py-0.5 disabled:opacity-50" /><label htmlFor="seed-r">results</label></span></div>
          {sugg.map(([k, l]) => <div key={k} className="mt-3"><h3 className="text-xs font-bold uppercase text-ink-3">{k === "category" ? "Categories" : k === "subtopic" ? "Sub-topics" : k === "tag" ? "Topics" : k === "author" ? "Authors" : "Collections"}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">{l.map((s) => <span key={s.k + s.v} draggable onDragStart={dragData({ k: s.k, v: s.v, l: s.l })} className="inline-flex max-w-full cursor-grab items-center rounded-full border border-dashed border-action-2/50 bg-surface py-0.5 pl-3 pr-0.5 text-sm"><button type="button" onClick={() => addChip("exp", { k: s.k, v: s.v, l: s.l })} className="line-clamp-1 min-h-8 text-left">{s.l} <span className="text-xs text-ink-3">{s.n}</span></button><AddTo c={{ k: s.k, v: s.v, l: s.l }} /><button type="button" aria-label={`Dismiss ${s.l}`} onClick={() => setSkip([...skip, s.k + s.v])} className="h-7 w-7 text-ink-3 hover:text-link">×</button></span>)}</div></div>)}
          {!sugg.length && <p className="mt-3 text-sm text-ink-3">{!seedF && !seedR ? "Tick a source above to seed suggestions." : "None right now."}</p>}
        </div></aside>
      </div>
      {(note || link) && <p role="status" className="mt-3 break-all text-sm text-ink-3">{note} {noteUndo && <button type="button" onClick={() => undo()} className="ml-1 min-h-8 rounded-full bg-action-fill px-3 font-medium text-white">Undo</button>} {link === "copied" ? "The search link is copied to your clipboard. It is also in the address bar." : link.startsWith("manual:") ? <>Could not copy automatically. The link is in the address bar: <span className="select-all">{link.slice(7)}</span></> : null}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <p className="text-sm"><b>{list.length}</b> item{list.length === 1 ? "" : "s"}{total > 0 && <span className="text-ink-3"> · {strict} match all required · {mode === "one" ? " · each has at least one Additional filter" : ` · +${viaExpand} via Expand`}</span>}</p>
        <ExportBtns rows={list} name="UPOU-advanced" />
      </div>
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"><div className="min-w-0">
        {list.length === 0 ? <p className="rounded-xl border border-dashed border-line p-8 text-center text-ink-2">No item fits all of this. Move a Required filter to Expand, or remove an Exclude.</p>
          : <>{total > 0 && <ResultCollections rows={list} />}<div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">Sort by <select value={sort} onChange={(e) => setSort(e.target.value)} className="min-h-10 rounded-md border border-line bg-surface px-2 text-base">{Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm">Q&amp;A <select value={qa} onChange={(e) => setQa(e.target.value)} className="min-h-10 rounded-md border border-line bg-surface px-2 text-base"><option value="off">Hidden</option><option value="q">Questions</option><option value="qa">Questions &amp; answers</option></select></label>
        <ViewToggle view={view} setView={setView} />
</div>{view !== "list" ? <ul className={"grid-pubs" + (view === "dense" ? " dense" : "")}>{list.slice(0, shown).map((a, i) => <Pub key={a.id} a={a} qa={qa} terms={terms} extra={<>{total > 0 && <Why a={a} n={i + 1} sort={sort} />}{toArea(a)}</>} />)}</ul> : <ol className="space-y-4">{list.slice(0, shown).map((a, i) => <Card key={a.id} a={a} qa={qa} terms={terms} extra={<>{total > 0 && <Why a={a} n={i + 1} sort={sort} />}<Fit a={a} areas={areas} />{toArea(a)}</>} />)}</ol>}</>}
        {list.length > shown && <div className="mt-6 text-center"><button type="button" onClick={() => setShown(shown + 24)} className="min-h-11 rounded-md bg-action-fill px-6 font-bold text-white hover:bg-action-2-fill">Show more ({list.length - shown} left)</button></div>}
      </div>
        <aside aria-label="Preview of suggestions" className="max-h-80 overflow-y-auto rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-4 lg:max-h-[75vh]">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-3">Preview of suggestions</h2>
          <p className="mt-1 text-xs text-ink-3">Not in your results, but a good fit. Each shows the suggestions it matches: click one to add it to Expand, use ＋ to pick any area, or drag it.</p>
          {preview.length === 0 && <p className="mt-3 rounded-lg border border-dashed border-line p-3 text-xs text-ink-3">No suggestions yet. Add a filter or a boost and good fits outside your results will appear here.</p>}
          <ul className="mt-3 space-y-3">{preview.map(({ a, m, n }) => <li key={a.id} draggable onDragStart={dragData(pubChip(a))} className="border-t border-line pt-3 first:border-0 first:pt-0"><Link to={"/read/" + a.id} className="font-serif leading-snug text-link hover:underline">{a.title}</Link><p className="mt-0.5 text-xs text-ink-3">{a.authors[0]}{a.authors.length > 1 ? " et al." : ""} · {a.year}</p><div className="mt-1 flex items-center gap-2"><span className="inline-block rounded-full bg-navy-soft px-2 py-0.5 text-xs">{n} of the suggestions</span><AddBtn id={a.id} label className="ml-auto" /><AddTo c={pubChip(a)} /></div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{m.map((x) => { const c = { k: x.k, v: x.v, l: x.l }; return <span key={x.k + x.v} draggable onDragStart={dragData(c)} className="inline-flex max-w-full items-center rounded-full border border-dashed border-action-2/50 bg-surface py-0.5 pl-2.5 pr-0.5 text-xs"><button type="button" onClick={() => addChip("exp", c)} title="Add to Expand" className="line-clamp-1 min-h-7 text-left">{x.l}</button>
              <AddTo c={c} /></span>; })}</div></li>)}</ul>
        </aside>
      </div>
      {lookup && <Lookup F={F} area={lookup} close={() => setLookup(null)} />}
    </section>
  );
}
