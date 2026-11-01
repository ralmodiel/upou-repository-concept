import { Emph, EmphKey } from "./emph.jsx";
import { citeStyle, styleText, STYLES, bibtex, ris, csv } from "./cite.js";
import { hayOf, countLine, urlEntry } from "./query.js";
import { parseBool, matchBool } from "./boolq.js";
import { CookieConsent, openCookieSettings } from "./Consent.jsx";
import { useSeo } from "./useSeo.js";
import { pref, useConsent, allow } from "./consent.js";
import { syncSW, applyUpdate } from "./sw-reg.js";
// This article's generated FAQs, fetched on first use (engine faqsFor); null while they load, [] when there are none, failed, or id is null.
const useFaqs = (id) => { const [f, set] = useState({ id: null, l: [] }); useEffect(() => { let on = true; if (id) faqsFor(id).then((l) => on && set({ id, l }), () => on && set({ id, l: [] })); return () => { on = false; }; }, [id]); return f.id === id ? [...f.l] : null; };
// Semantic-model state for the progress line: {s: off|loading|ready|failed, pct}.
export const useModel = () => { const [, t] = useState(0); useEffect(() => onModel(() => t((n) => n + 1)), []); return modelState(); };
import { Component, lazy, memo, Suspense, useMemo, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lock, useAccess } from "./access.js";
import { withTitle } from "./personName.js";
import { load, startModel, modelState, onModel, searchArticles, didYouMean, didYouMeanAsync, warmSearch, faqsFor, pagePassage, FIELD_LABEL } from "./engine.js";

// Hash routing with scroll memory: going back to the previous route restores its scroll position; anything else starts at the top.
const trail = [{ route: location.hash.slice(1) || "/", y: 0 }];
let keep = false; // the next navigation stays at the current scroll level (the logo emblem)
const useHash = () => {
  const [h, setH] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const onHash = () => setH(location.hash.slice(1) || "/");
    const onScroll = () => { trail.at(-1).y = scrollY; };
    addEventListener("hashchange", onHash); addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("hashchange", onHash); removeEventListener("scroll", onScroll); };
  }, []);
  useLayoutEffect(() => {
    if (trail.at(-1).route === h) return;
    const back = !keep && trail.at(-2)?.route === h; // an emblem click is forward even when it lands on the page two steps back
    const stay = keep && !back; keep = false;
    if (back) trail.pop(); else trail.push({ route: h, y: stay ? scrollY : 0 });
    if (!stay) scrollTo(0, back ? trail.at(-1).y : 0);
  }, [h]);
  return h;
};
// hostile hashes: no control characters, and at most 4000 chars (a planner's Boolean string is read whole; the engine gets <= 300)
export const qclean = (s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 4000);
export const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } }; // hostile hashes (%E0%A4%A) must not throw
export const Link = ({ to, className = "", children, ...rest }) => <a href={"#" + to} className={className} {...rest}>{children}</a>;
export const by = (a) => a.authors.join("; ");
const topicOpen = {}; // Topics: which sub-topic lists are open, for this visit only (memory, nothing stored)
const pagesOf = (a) => (a.pages ? ` · ${a.pages.toLocaleString("en-US")} pages` : ""); // R272: 2,613 pages, not 2613
const asset = (p) => import.meta.env.BASE_URL + p;
export const slug = (c) => c.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
export const colKey = (a) => slug(a.collection || "other");
export const TYPES = ["Thesis", "Student paper", "Article", "Presentation", "Report", "Book", "Course module", "Dataset", "Other"];
const tagTo = (t) => "/tag/" + encodeURIComponent(t);
// Cards can be dragged into the Advanced Search areas as an item filter.
// We never host files or follow arbitrary links: only repository handles and DOIs are linked out.
export const repoUrl = (u) => /^https:\/\/repository\.upou\.edu\.ph\/handle\/[\w./%-]+$/.test(u || "");
export const doiUrl = (d) => (/^10\.\d{4,9}\/[^\s<>"]+$/.test(d || "") ? "https://doi.org/" + encodeURI(d).replace(/[?#']/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()) : null);
const dragChip = (a) => (e) => { e.dataTransfer.setData("text/chip", JSON.stringify({ k: "pub", v: a.id, l: a.title })); e.dataTransfer.effectAllowed = "copyMove"; };
const store = (k, v) => { try { if (v === undefined) { const a = JSON.parse(pref.get(k) || "[]"); return Array.isArray(a) ? a.slice(0, 200) : []; } pref.set(k, JSON.stringify(v)); } catch { return []; } };
const recents = () => store("upou-recent").filter((x) => typeof x === "string" && x.trim() && x.length < 200);
const remember = (q) => q.trim() && store("upou-recent", [q, ...recents().filter((x) => x !== q)].slice(0, 6));
const saved = () => store("upou-saved").filter((x) => typeof x === "string" && x.length < 200);
// Query operators: "exact phrase", -word, author:name (or author:"two words"), year:2020 or year:2018-2020; each kept as a removable chip.
export const parseQuery = (q) => {
  const o = { phrases: [], neg: [], author: "", y: null, ops: [] };
  const text = (q || "").replace(/"([^"]+)"|(^|\s)-([\p{L}\p{N}][\p{L}\p{N}-]*)|\bauthor:("[^"]+"|\S+)|\byear:(\d{4})(?:-(\d{4}))?/giu, (m, ph, sp, ng, au, y1, y2) => {
    if (ph) { o.phrases.push(ph.toLowerCase()); o.ops.push([`“${ph}”`, m]); return " " + ph + " "; }
    if (ng) { o.neg.push(ng.toLowerCase()); o.ops.push(["not " + ng, m.trim()]); return " "; }
    if (au) { o.author = au.replace(/"/g, "").toLowerCase(); o.ops.push(["author: " + au.replace(/"/g, ""), m]); return " "; }
    o.y = [+y1, +(y2 || y1)].sort((a, b) => a - b); o.ops.push(["year: " + (o.y[0] === o.y[1] ? o.y[0] : o.y.join("–")), m]); return " ";
  }).replace(/\s+/g, " ").trim();
  // bool: the query for the Boolean predicate (boolq.js), with only author: and year: taken out
  return { ...o, text, bool: (q || "").replace(/\bauthor:("[^"]+"|\S+)|\byear:\d{4}(?:-\d{4})?/giu, " ") };
};
export const clip = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s\S*$/, "") + "…" : t);

// View lists (playlists): named collections of items, kept in localStorage, shared across components.
const listeners = new Set();
export const getLists = () => {
  const l = store("upou-lists").filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.items));
  if (l.length) return l;
  return [{ id: "l1", name: "My list", items: store("upou-list").filter((x) => typeof x === "string" || typeof x === "number") }];
};
export const saveLists = (l) => { store("upou-lists", l); listeners.forEach((f) => f()); };
const toggleIn = (lid, id) => saveLists(getLists().map((l) => l.id === lid ? { ...l, items: l.items.includes(id) ? l.items.filter((x) => x !== id) : [...l.items, id] } : l));
export const newList = (name, id) => { const l = getLists(), lid = "l" + Date.now().toString(36); saveLists([...l, { id: lid, name: name.trim().slice(0, 40) || "Untitled list", items: id ? [id] : [] }]); return lid; };
export function useLists() {
  const [l, set] = useState(getLists);
  useEffect(() => { const f = () => set(getLists()); listeners.add(f); return () => listeners.delete(f); }, []);
  return l;
}
// The + button opens a small menu: tick the lists an item belongs to, or start a new list with it.
export function AddBtn({ id, className = "", label }) {
  const lists = useLists(), off = !useConsent()?.lists, on = lists.some((l) => l.items.includes(id)), [pos, setPos] = useState(null), [name, setName] = useState(""), [msg, setMsg] = useState(""), btn = useRef(null);
  const close = () => setPos(null);
  useEffect(() => {
    if (!pos) return;
    const esc = (e) => { if (e.key === "Escape") { close(); btn.current?.focus(); } };
    addEventListener("keydown", esc); addEventListener("scroll", close, true); addEventListener("resize", close);
    return () => { removeEventListener("keydown", esc); removeEventListener("scroll", close, true); removeEventListener("resize", close); };
  }, [pos]);
  const open = () => { const r = btn.current.getBoundingClientRect(), up = r.bottom + 260 > innerHeight; setMsg(""); setPos({ left: Math.max(8, Math.min(r.left, innerWidth - 248)), [up ? "bottom" : "top"]: up ? innerHeight - r.top + 4 : r.bottom + 4 }); };
  return (
    <>
      <button ref={btn} type="button" onClick={() => (off ? openCookieSettings() : pos ? close() : open())} aria-haspopup="dialog" aria-expanded={!!pos} aria-disabled={off || undefined} aria-label={label ? undefined : on ? "In a view list; change lists" : "Add to a view list"} title={off ? "View lists are off. Change Cookie settings (allow View lists) to use this feature." : "Add to a view list"}
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition ${on ? "bg-link-fill text-white" : "bg-navy-soft text-navy hover:bg-sky"} ${label ? "px-4 py-2" : "h-10 w-10 text-xl"} ${off ? "opacity-50" : ""} ${className}`}>{on ? "✓" : "+"}{label && <span>{on ? "In a view list" : "Add to view list"}</span>}</button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div role="dialog" aria-label="Add to a view list" style={pos} className="fixed z-50 w-60 rounded-xl border border-line bg-surface p-3 text-ink shadow-2xl">
            <div className="mb-1 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-ink-3">Add to view list</p><button type="button" onClick={() => { close(); btn.current?.focus(); }} aria-label="Close" title="Close" className="-mr-1 grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-ink-3 hover:bg-navy-soft hover:text-ink">×</button></div>
            <ul className="max-h-40 overflow-y-auto">{lists.map((l) => <li key={l.id}><label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={l.items.includes(id)} onChange={() => { setMsg((l.items.includes(id) ? "Removed from " : "Added to ") + l.name); toggleIn(l.id, id); }} /><span className="line-clamp-1">{l.name}</span><span className="ml-auto text-xs text-ink-3">{l.items.length}</span></label></li>)}</ul>
            <p role="status" className="text-xs text-ink-2">{msg}</p>
            <form className="mt-2 flex gap-1.5 border-t border-line pt-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { newList(name, id); setMsg("Added to " + name.trim().slice(0, 40)); setName(""); } }}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="New list name" aria-label="New list name" className="min-w-0 flex-1 rounded-md border border-line px-2 py-1.5 text-base" />
              <button aria-label="Create list" title="Create list" className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-action-fill text-lg font-bold leading-none text-white hover:bg-action-2-fill"><span aria-hidden="true">+</span></button>
            </form>
            <Link to="/list" onClick={close} className="mt-2 block text-sm text-link hover:underline">Open my lists →</Link>
          </div>
        </>, document.body)}
    </>
  );
}
function Header({ route }) {
  const { open } = useAccess();
  const n = new Set(useLists().flatMap((l) => l.items)).size;
  const tab = (to, label, on) => <Link to={to} onMouseEnter={LOAD[to]} onFocus={LOAD[to]} onTouchStart={LOAD[to]} className={`inline-flex min-h-11 items-center rounded-full px-2.5 text-sm font-medium sm:px-4 ${on ? "bg-surface text-navy" : "text-white/90 hover:bg-white/10"}`}>{label}</Link>;
  return (
    <header className="text-white print:hidden">
      <div className="bg-surface"><div className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 sm:px-8">
        <Link to="/" aria-label="UPOU Repository concept: home" aria-describedby="logo-note" className="group relative flex items-center gap-4 py-4">
          <img src={asset("img/upou-seal-96.png")} width="48" height="48" alt="" className="shrink-0" />
          <span id="logo-note" role="tooltip" className="pointer-events-none absolute left-0 top-full z-50 hidden w-72 rounded-md bg-ink-fill p-3 text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg group-hover:block group-focus-visible:block">Disclaimer: this is a proof of concept, not an official UPOU site. The UPOU name and seal belong to UP Open University and are shown only to identify the source of the records.</span>
          <span><span className="block text-xs font-bold uppercase tracking-[0.18em] text-link">UP Open University</span><span className="block font-serif text-2xl leading-tight text-ink sm:text-3xl">Repository <span className="text-base text-ink-3">· concept</span></span></span>
        </Link>
      </div></div>
      <div className="bg-navy-fill"><div className="mx-auto flex max-w-6xl min-[1536px]:max-w-[88rem] flex-wrap items-center gap-3 px-4 py-1 sm:px-8 sm:py-2">
        <nav className="-mx-1 flex w-full gap-0.5 overflow-x-auto sm:mx-0 sm:ml-auto sm:w-auto sm:gap-1" aria-label="Main">{tab("/", "Home", route === "/" || /^\/(cat|year|tag|faculty|type)/.test(route))}{tab("/collections", "Collections", route.startsWith("/collection"))}{tab("/topics", "Topics", route.startsWith("/topics"))}{tab("/search", "Search", route.startsWith("/search"))}{tab("/advanced", "Advanced", route.startsWith("/advanced"))}{tab("/advisers", "Advisers", /^\/advisers?(\/|$)/.test(route))}<LockButton />{tab("/maps", "Maps", route.startsWith("/maps"))}{tab("/list", "View lists" + (n ? ` (${n})` : ""), route.startsWith("/list"))}<button type="button" onClick={openCookieSettings} title="Cookie settings" aria-label="Cookie settings" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-lg text-white/90 hover:bg-white/10"><span aria-hidden="true">🍪</span></button></nav>
      </div></div>
      <div className="h-1 bg-link-fill" />
    </header>
  );
}


// Generated covers: colour by faculty (the repository's maroon, green and blue), glyph by item type. No images.
const PAL = { fics: ["#2b4e72", "#1d354d"], fmds: ["#00573f", "#0c3a2c"], fed: ["#8a1538", "#3f0a19"], other: ["#6a4a12", "#33280c"] };
const facKey = (a) => /information|fics/i.test(a.faculty) ? "fics" : /management|fmds/i.test(a.faculty) ? "fmds" : /education|fed/i.test(a.faculty) ? "fed" : "other";
const pal = (a) => PAL[facKey(a)];
const MOTIF = { Thesis: "graduation", Article: "pages", "Student paper": "bulb", Presentation: "teacher", Report: "chart", Book: "pages", "Course module": "teacher", Dataset: "chart", Other: "puzzle" };
const motif = (a) => MOTIF[a.type] || "puzzle";
const grad = (a, d = 150) => `linear-gradient(${d}deg, ${pal(a)[0]}, ${pal(a)[1]})`;
// Cover background: scrims under the title (bottom) and the type line (top) keep white text >= 4.5:1 on the palette colours;
// odd seeds flip the palette so neighbours from one faculty don't look alike.
const coverBg = (a, s) => { const [c0, c1] = pal(a), [x, y] = s % 2 ? [c1, c0] : [c0, c1];
  return `linear-gradient(to top, rgb(0 0 0 / .55), rgb(0 0 0 / .45) 38%, transparent 72%), linear-gradient(to bottom, rgb(0 0 0 / .3), transparent 22%), linear-gradient(${130 + ((s >> 3) % 7) * 12}deg, ${x}, ${y})`; };
const ICON = {
  pages: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5" /></>,
  network: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6 8l5 8M18 8l-5 8" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  brain: <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4a3 3 0 0 0-3 0zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  laptop: <><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M2 20h20" /></>,
  graduation: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11.5V16c3 2.5 9 2.5 12 0v-4.5" /></>,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />,
  chart: <path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9" />,
  people: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-4 3-6 6-6s6 2 6 6M15 14c3 0 6 1.5 6 5" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></>,
  magnifier: <><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></>,
  teacher: <><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M8 20l4-4 4 4" /></>,
  puzzle: <path d="M5 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 0 0 4v4H5z" />,
  // UI icons (round 47: one set, one stroke style; draw with <Icon m=".." w={2} />)
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.9-4.9" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /><path className="spark" d="M19 11v3M17.5 12.5h3" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  filter: <><path d="M3 5h14l-5.5 6.5V17l-3 2v-7.5z" /><circle cx="17.5" cy="17.5" r="3" /><path d="m20 20 2 2" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  swapV: <path d="M8 4v16M4 16l4 4 4-4M16 20V4M12 8l4-4 4 4" />,
  swapH: <path d="M4 8h14M15 4l4 4-4 4M20 16H6M9 12l-4 4 4 4" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
};
export const Icon = ({ m, className = "", w = 1.5 }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><use href={"#ic-" + (ICON[m] ? m : "pages")} /></svg>;
// R267: each icon's shapes are written once as a <symbol>; every Icon is an svg plus one <use> (fewer DOM nodes, same-document reference so the CSP is unaffected)
const IconDefs = () => <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">{Object.entries(ICON).map(([k, v]) => <symbol key={k} id={"ic-" + k} viewBox="0 0 24 24">{v}</symbol>)}</svg>;
const seed = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997; return h; };
// A generated cover: faculty colours, a seeded pattern, a type icon, the title.
function Cover({ a, className = "", small }) {
  const s = seed(a.id);
  return (
    <div className={`cover gen ${className}`} style={{ background: coverBg(a, s) }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 133" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {[ // three motif families picked by the seed: soft circles, diagonal bands, concentric rings
          <><circle cx={20 + (s % 60)} cy={20 + (s % 30)} r={38 + (s % 20)} fill="#fff" opacity=".09" /><circle cx={90 - (s % 40)} cy={115 - (s % 25)} r={30 + (s % 14)} fill="#fff" opacity=".12" /></>,
          <g stroke="#fff" opacity=".1">{[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${-40 + i * 28 + (s % 20)} 133 L${40 + i * 28 + (s % 20)} 0`} strokeWidth={6 + (i * s) % 9} />)}</g>,
          <g fill="none" stroke="#fff" opacity=".13">{[14, 26, 38, 50].map((r) => <circle key={r} cx={78 - (s % 30)} cy={30 + (s % 25)} r={r} strokeWidth="1.2" />)}</g>,
        ][(s >> 1) % 3]}
        <path d={`M0 ${95 + (s % 20)} Q 50 ${70 + (s % 30)} 100 ${100 + (s % 18)} V133 H0z`} fill="#000" opacity=".12" />
      </svg>
      <Icon m={motif(a)} className="absolute -bottom-[6%] -right-[6%] h-[62%] w-[62%] text-white/30" w={0.7} />
      <div aria-hidden="true" className="face relative z-[1] flex h-full flex-col p-[8%] text-white">
        <span className="text-[4.4cqw] font-bold uppercase tracking-[0.14em] text-white/80">{a.type} · {a.year}</span>
        <div className="mt-auto" />
        <div className="font-serif font-normal leading-[1.12]" style={{ fontSize: small ? "9cqw" : "8.6cqw", WebkitLineClamp: small ? 4 : 5, display: "-webkit-box", WebkitBoxOrient: "vertical", overflow: "hidden", textShadow: "0 1px 3px rgb(0 0 0 / .45)" }}>{a.title}</div>
        <span className="mt-[5%] line-clamp-1 text-[4.6cqw] text-white/85">{a.authors[0]?.split(",")[0]}{a.authors.length > 1 ? " et al." : ""}</span>
      </div>
      <div className="peek">{clip(a.abstract || a.title, 140)}</div>
    </div>
  );
}
// Where in the PDF an answer came from (qa.py locates page + paragraph for every FAQ).
const Ref = ({ f }) => (f.page || f.para) ? <p className="mt-1 text-xs text-ink-3">Source: {f.page ? <Link to={`/read/${f.article}/p/${f.page}/`} title="Show this page’s passage" className="text-link underline">PDF page {f.page}</Link> : ""}{f.page && f.para ? ", " : ""}{f.para ? `paragraph ${f.para}` : ""}</p> : null;
// Q&A under a result: this item's generated FAQs, best match to the query words first; mode "q" lists the questions, "qa" lets each open to its answer.
export function QA({ a, mode, terms = [] }) {
  const faqs = useFaqs(mode && mode !== "off" ? a.id : null); // hook before the early return; no fetch while Q&A is off
  if (!mode || mode === "off") return null;
  const score = (f) => terms.reduce((n, t) => n + ((f.q + " " + f.a).toLowerCase().includes(t) ? 1 : 0), 0) + (f.kind === "key" ? 0.5 : 0); // key questions win ties
  const list = (faqs || []).sort((x, y) => score(y) - score(x)).slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="border-t border-line bg-navy-soft/40 p-2.5 pl-3 text-left" aria-label={`Questions answered by ${a.title}`}>
            <p className="mb-1.5 rounded bg-amber-100 px-1.5 py-1 text-2xs font-semibold leading-snug text-amber-950">Never cite from AI answers; check the item itself.</p>
      <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-ink-3">Q&amp;A <span className="rounded bg-crimson-soft px-1.5 py-px text-2xs font-bold text-link" title="Generated by a language model; check the original article">AI</span></p>
      {mode === "q" ? <ul className="mt-1 space-y-1">{list.map((f) => <li key={f.id} className="line-clamp-2 text-xs leading-snug text-ink-2">{f.q}</li>)}</ul>
        : <div className="mt-1 divide-y divide-line">{list.map((f) => <details key={f.id} className="py-1"><summary className="cursor-pointer text-xs font-medium leading-snug text-ink">{f.q}</summary><p className="mt-1 text-xs leading-snug text-ink-2">{f.a} <AiLabel /></p><Ref f={f} /></details>)}</div>}
    </div>
  );
}
export const Pub = memo(function Pub({ a, qa, terms, extra }) {
  const [tip, setTip] = useState(false); // touch screens have no hover: a button shows the .peek text
  return (
    <li className="pub" draggable onDragStart={dragChip(a)}>
      <div className="h-full overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition hover:shadow-lg">
        <div className="relative">
          <Link to={"/read/" + a.id} className="pub-link block"><Cover a={a} className="!rounded-none" /></Link>
          <AddBtn id={a.id} className="absolute right-2 top-2 z-10 !h-8 !w-8 pointer-coarse:!h-11 pointer-coarse:!w-11 !bg-surface shadow-md ring-1 ring-black/5" /><Link to={"/maps/pub/" + a.id} aria-label={`Relationship map of ${a.title}`} title="Relationship map" className="absolute bottom-1.5 right-1.5 z-10 rounded-full before:absolute before:-inset-3 before:content-['']  bg-surface px-2 py-0.5 text-2xs font-medium text-link shadow hover:underline">Map</Link>
        </div>
        <div className="p-2.5 pl-3"><p className="min-w-0 flex-1 text-xs leading-snug text-ink-3" title={a.authors.join("; ")}><span className="line-clamp-3 text-ink-2">{a.authors.join("; ")}</span>{a.year} · {a.type}{pagesOf(a)}</p>
          <button type="button" aria-expanded={tip} onClick={() => setTip(!tip)} className="mt-1 hidden min-h-11 text-xs font-medium text-link pointer-coarse:block">{tip ? "Hide summary" : "Show summary"}</button>{tip && <p className="text-xs leading-snug text-ink-2">{clip(a.abstract || a.title, 140)}</p>}</div>
        <Passage p={a.passage} id={a.id} small />
        <QA a={a} mode={qa} terms={terms} />
        {extra}
      </div>
    </li>
  );
});
function Row({ title, items, to, sub, render = (a) => <Pub key={a.id} a={a} /> }) {
  const ref = useRef(null), [edge, setEdge] = useState({ start: true, end: false });
  const measure = () => { const t = ref.current; if (t) setEdge({ start: t.scrollLeft < 8, end: t.scrollLeft + t.clientWidth >= t.scrollWidth - 8 }); };
  // R276: a row holds 8 cards until it comes near the viewport, then all of them (home DOM 7558 -> under 4000 nodes; cover art is the bulk)
  const [more, setMore] = useState(false);
  useEffect(() => { if (more) return; if (typeof IntersectionObserver === "undefined") return setMore(true); const o = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setMore(true); }, { rootMargin: "300px" }); o.observe(ref.current); return () => o.disconnect(); }, [more]);
  useEffect(() => { measure(); addEventListener("resize", measure); return () => removeEventListener("resize", measure); }, [items, more]);
  const step = (d) => ref.current.scrollBy({ left: d * ref.current.clientWidth * 0.9, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const btn = (d, label, hide, cls, glyph) => !hide && <button type="button" aria-label={`${label} in ${title}`} onClick={() => step(d)} className={`row-btn ${cls}`}>{glyph}</button>;
  // R293: See all keeps its 44 px tap target, but -my-1.5 stops it pushing the heading down, so bands with and without it share one rhythm
  return (
    <div className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 py-7 sm:px-8">
      <div className="flex items-baseline gap-3">
        <h2 className="font-serif text-2xl text-ink">{title}</h2>
        <span className="min-w-0 text-sm text-ink-3">{sub ?? `${items.length} items`}</span>
        {to && <Link to={to} className="-my-1.5 ml-auto inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-sm font-medium text-link hover:underline">See all →</Link>}
      </div>
      <div className="row">
        {btn(-1, "Previous", edge.start, "left-1", "‹")}
        <ul ref={ref} onScroll={measure} tabIndex={0} aria-label={title} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1); } }} className="row-track" style={{ "--fl": edge.start ? "0px" : "2.5rem", "--fr": edge.end ? "0px" : "2.5rem" }}>{items.slice(0, !more ? 8 : to ? 40 : items.length).map(render)}</ul>
        {btn(1, "Next", edge.end, "right-1", "›")}
      </div>
    </div>
  );
}

function Hero({ items }) {
  const [n, setN] = useState(() => Math.floor(Date.now() / 864e5) % items.length), a = items[n];
  return (
    <section className="relative overflow-hidden bg-navy-fill text-white">
      <div className="absolute inset-0" style={{ background: grad(a, 120) }} aria-hidden="true" />
      <img src={import.meta.env.BASE_URL + "img/banner.jpg"} alt="" width="1200" height="420" decoding="async" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-luminosity" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-r from-navy-fill/95 via-navy-fill/70 to-navy-fill/10" aria-hidden="true" />
      <div key={a.id} className="rise relative mx-auto grid max-w-6xl min-[1536px]:max-w-[88rem] items-center gap-8 px-4 py-10 sm:px-8 md:grid-cols-[1fr_13rem] md:py-14">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky">Featured · {a.type} · {a.faculty || "UPOU"}</p>
          <h1 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">{a.title}</h1>
          <p className="mt-3 text-white/80">{by(a)} · {a.year}</p>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/90">{clip(a.abstract, 300)}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={"/read/" + a.id} className="rounded-full bg-surface px-6 py-2.5 font-bold text-navy transition hover:brightness-105">View record</Link>
            {repoUrl(a.url) && <a href={a.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/40 bg-white/10 px-6 py-2.5 font-medium backdrop-blur hover:bg-white/20">Open in the UPOU Repository ↗</a>}
            <button onClick={() => setN((n + 1 + Math.floor(Math.random() * (items.length - 1))) % items.length)} className="rounded-full px-4 py-2.5 text-sm text-white/80 hover:text-white">Surprise me ↻</button>
          </div>
        </div>
        <Link to={"/read/" + a.id} className="pub-link hidden md:block"><Cover a={a} className="rotate-2 !shadow-2xl" /></Link>
      </div>
    </section>
  );
}


// Type-ahead like the OER app: matching topics, categories, collections and titles; recent searches when empty.
function suggestions(q, fix) {
  const S = window.__S, t = q.trim().toLowerCase(), terms = t.split(/\s+/).filter(Boolean);
  if (t.length < 2) return recents().map((r) => ({ kind: "recent", label: r, to: "/search/" + encodeURIComponent(r) }));
  if (!S.sugg) { // counted once per load, not per keystroke
    const tags = {}; S.articles.forEach((a) => a.subjects.forEach((s) => { tags[s] = (tags[s] || 0) + 1; }));
    S.sugg = { tags: Object.entries(tags).sort((x, y) => y[1] - x[1]), cats: [...new Set(S.articles.flatMap((a) => a.categories))], subs: [...new Set(S.articles.flatMap((a) => a.subtopics))], cols: [...new Map(S.articles.map((a) => [colKey(a), a.collection]))], low: S.articles.map((a) => a.title.toLowerCase()) };
  }
  const { tags, cats, subs, cols, low } = S.sugg;
  return [
    ...(fix ? [{ kind: "did you mean", label: fix, to: "/search/" + encodeURIComponent(fix) }] : []),
    ...tags.filter(([s]) => s.toLowerCase().includes(t)).slice(0, 3).map(([s, n]) => ({ kind: "tag", label: s + " · " + n, to: tagTo(s) })),
    ...cats.filter((c) => c.toLowerCase().includes(t)).slice(0, 2).map((c) => ({ kind: "category", label: c, to: "/cat/" + slug(c) })),
    ...subs.filter((c) => c.toLowerCase().includes(t)).slice(0, 2).map((c) => ({ kind: "sub-topic", label: c, to: "/sub/" + slug(c) })),
    ...cols.filter(([, l]) => l.toLowerCase().includes(t)).slice(0, 2).map(([k, l]) => ({ kind: "collection", label: l, to: "/collection/" + k })),
    ...S.articles.filter((a, i) => terms.every((w) => low[i].includes(w))).slice(0, 4).map((a) => ({ kind: "item", label: a.title, to: "/read/" + a.id })),
    { kind: "search", label: `Search all for “${q.trim()}”`, to: "/search/" + encodeURIComponent(q.trim()) },
  ];
}
const download = (name, text, type) => { const u = URL.createObjectURL(new Blob([text], { type })), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
// Export a whole result list (all pages, not only the ones shown); each record keeps its handle (20.500.13073/<n>) as stable id
export function ExportBtns({ rows, name = "UPOU-results" }) {
  const b = "min-h-10 rounded-md border border-line bg-surface px-3 text-sm text-link hover:bg-navy-soft";
  return rows.length > 0 && <span role="group" aria-label={`Export all ${rows.length} results`} className="flex flex-wrap items-center gap-1.5 text-sm"><span className="text-ink-3">Export all:</span>
    <button type="button" className={b} onClick={() => download(name + ".ris", ris(rows), "application/x-research-info-systems")}>RIS</button>
    <button type="button" className={b} onClick={() => download(name + ".bib", bibtex(rows), "application/x-bibtex")}>BibTeX</button>
    <button type="button" className={b} onClick={() => download(name + ".csv", csv(rows), "text/csv")}>CSV</button></span>;
}
function SearchBox({ value, onChange, placeholder, className = "", btn = "bg-action-fill hover:bg-action-2-fill" }) {
  const [open, setOpen] = useState(false), [cur, setCur] = useState(-1), [fix, setFix] = useState(null), m = useModel(), sid = useId();
  // "did you mean" runs in the search worker; a late answer for an older value is dropped
  useEffect(() => { let on = true, t; if (open && value.trim().length >= 2) t = setTimeout(() => didYouMeanAsync(value).then((f) => on && setFix(f)).catch(() => {}), 120); else setFix(null); return () => { on = false; clearTimeout(t); }; }, [value, open]); // 120 ms debounce: a burst of keystrokes asks the worker once
  const list = open ? suggestions(value, fix) : [];
  const go = (to, q) => { setOpen(false); if (q) remember(q); location.hash = to; };
  const submit = (e) => { e.preventDefault(); const it = list[cur]; if (it) go(it.to, it.kind === "search" || it.kind === "recent" || it.kind === "did you mean" ? it.label.replace(/^Search all for “|”$/g, "") : null); else if (value.trim()) go("/search/" + encodeURIComponent(value.trim()), value.trim()); };
  const key = (e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setCur((cur + 1) % Math.max(list.length, 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setCur((cur - 1 + list.length) % Math.max(list.length, 1)); } else if (e.key === "Escape") { if (open && list.length) { setOpen(false); setCur(-1); } else onChange(""); } /* first Esc closes the suggestions, the next clears */ else if (e.key === "Home" && open && list.length) { e.preventDefault(); setCur(0); } else if (e.key === "End" && open && list.length) { e.preventDefault(); setCur(list.length - 1); } };
  return (
    <form onSubmit={submit} className={`relative flex gap-2 ${className}`} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <span className="relative flex min-w-0 flex-1"><input role="combobox" aria-expanded={open && list.length > 0} aria-controls={sid} aria-activedescendant={cur >= 0 && list[cur] ? sid + "o" + cur : undefined} aria-autocomplete="list" autoComplete="off" value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setCur(-1); }} onFocus={() => { setOpen(true); warmSearch(); if (allow("model")) startModel(true); }} onKeyDown={key} placeholder={placeholder} aria-label="Search items" className="min-w-0 flex-1 rounded-md border border-line bg-surface py-3 pl-4 pr-11 text-base text-ink" />{value && <button type="button" aria-label="Clear search" onClick={(e) => { onChange(""); e.currentTarget.previousSibling.focus(); }} className="absolute right-0 top-0 inline-flex h-full w-11 items-center justify-center text-lg text-ink-2 hover:text-ink"><span aria-hidden="true">×</span></button>}</span>
      <button className={`inline-flex items-center gap-2 rounded-md px-5 py-3 font-bold text-white sm:px-7 ${btn}`}><Icon m="search" w={2} className="h-[18px] w-[18px]" />Search</button>
      <Link to="/advanced" onClick={(e) => { const t = value.trim(); if (!t) return; e.preventDefault(); import("./Advanced.jsx").then((m) => m.addChip("req", { k: "words", v: t, l: t })).catch(() => {}).finally(() => { location.hash = "/advanced"; }); }} title="Advanced search: combine categories, tags, authors, collections and years. Your search words become a Required filter" aria-label="Advanced search" className="pulse-orange inline-flex shrink-0 items-center gap-2 rounded-md bg-[#c2410c] px-4 py-3 font-bold text-white hover:bg-[#9a3412]">
        <Icon m="sliders" w={2} className="h-5 w-5" />
        <span className="hidden sm:inline">Advanced</span>
      </Link>
      {list.length > 0 && <ul id={sid} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-line bg-surface py-1 text-ink shadow-xl">
        {list.map((s, i) => <li key={s.kind + s.label} id={sid + "o" + i} role="option" aria-selected={i === cur}><a href={"#" + s.to} onClick={() => { setOpen(false); if (s.kind === "search" || s.kind === "recent") remember(s.label.replace(/^Search all for “|”$/g, "")); }} onMouseEnter={() => setCur(i)} className={`flex items-baseline gap-3 px-4 py-2 ${i === cur ? "bg-navy-soft" : ""}`}><span className="w-20 shrink-0 text-xs uppercase tracking-wide text-ink-3">{s.kind}</span><span className="line-clamp-1">{s.label}</span></a></li>)}
      </ul>}
      {!list.length && (m.s === "loading" || m.s === "failed") && <p role="status" data-model={m.s} className="pointer-events-none absolute left-0 top-full z-20 mt-1 rounded bg-surface/95 px-2 py-0.5 text-xs text-ink-2 shadow">{m.s === "loading" ? `Loading search by meaning… ${m.pct}%` : "Search by meaning is unavailable: matching words only"}</p>}
    </form>
  );
}

const colList = () => {
  const m = new Map(); [...window.__S.articles].sort((x, y) => y.year - x.year).forEach((a) => { const k = colKey(a); (m.get(k) || m.set(k, { k, label: a.collection || "Other", items: [] }).get(k)).items.push(a); });
  return [...m.values()].sort((x, y) => y.items.length - x.items.length);
};
// A collection is a shelf: faculty colours, a type icon, the count. Generated, no image.
function CollectionCard({ it, q = "" }) {
  const a = it.items[0];
  return (
    <li className="pub">
      <Link to={"/collection/" + it.k + q} className="pub-link block h-full overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
        <div className="relative flex aspect-[3/2] items-center justify-center overflow-hidden text-white" style={{ background: grad(a, 130) }}><Icon m={motif(a)} className="h-20 w-20 opacity-60" w={0.8} />
          <span className="absolute left-2 top-2 rounded-full bg-navy px-2.5 py-0.5 text-xs font-bold text-white">{it.all ? `${it.items.length} of ${it.all}` : it.items.length} items</span></div>
        <div className="p-3"><h3 className="font-serif text-lg leading-snug text-ink">{it.label}</h3><p className="mt-1 text-xs text-ink-3">{a.faculty}</p></div>
      </Link>
    </li>
  );
}
const COL_FACETS = [["year", "Year", (a) => [String(a.year)]], ["type", "Type", (a) => [a.type]], ["cat", "Topic", (a) => a.categories], ["sub", "Sub-topic", (a) => a.subtopics], ["tag", "Tag", (a) => a.subjects]];
// stale picks (a value no item has, an unknown facet) are dropped; the count feeds one "ignored" note
const cleanQ = (q) => { let bad = 0; const o = {}; for (const k in q) { const c = COL_FACETS.find((x) => x[0] === k), v = c ? q[k].filter((x) => window.__S.articles.some((a) => c[2](a).includes(x))) : []; bad += q[k].length - v.length; if (v.length) o[k] = v; } return [o, bad]; };
const parseQ = (pre) => { const o = {}; for (const [k, v] of new URLSearchParams(dec(pre || ""))) (o[k] ||= []).push(v); return o; };
function Collections({ pre }) {
  const [init] = useState(() => cleanQ(parseQ(pre))), [fs, setFs] = useState(init[0]), [more, setMore] = useState({}), [open, setOpen] = useState(() => matchMedia("(min-width: 1024px)").matches);
  const all = window.__S.articles, ok = (a, skip) => COL_FACETS.every(([k, , f]) => k === skip || !fs[k]?.length || fs[k].every((v) => f(a).includes(v)));
  // counts for a facet ignore that facet's own picks, so its other values stay pickable; picks combine with AND
  const opts = (k, f) => { const m = new Map(); all.filter((a) => ok(a, k)).forEach((a) => new Set(f(a)).forEach((v) => m.set(v, (m.get(v) || 0) + 1))); (fs[k] || []).forEach((v) => m.has(v) || m.set(v, 0)); return [...m].sort(k === "year" ? (x, y) => y[0] - x[0] : (x, y) => y[1] - x[1] || x[0].localeCompare(y[0])); };
  const toggle = (k, v) => setFs((o) => ({ ...o, [k]: o[k]?.includes(v) ? o[k].filter((x) => x !== v) : [...(o[k] || []), v] }));
  const nSel = Object.values(fs).reduce((n, l) => n + l.length, 0);
  const full = colList(), list = nSel ? full.map((c) => ({ ...c, all: c.items.length, items: c.items.filter((a) => ok(a)) })).filter((c) => c.items.length) : full, facs = [...new Set(list.map((c) => c.items[0].faculty))];
  const hits = list.reduce((n, c) => n + c.items.length, 0);
  // the picks travel with the link: the collection page opens with the same filters (year: one value only, the page filters by a single year)
  const carry = nSel ? "/" + encodeURIComponent(new URLSearchParams(Object.entries(fs).flatMap(([k, l]) => l.map((v) => [k, v]))).toString()) : "";
  useEffect(() => { history.replaceState(history.state, "", "#/collections" + carry); }, [carry]); // the picks live in the address, so Back and the breadcrumb return to them
  return (
    <section className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 py-8 sm:px-8">
      <h1 className="font-serif text-3xl">Collections</h1><p className="text-ink-3">{list.length} collection{list.length === 1 ? "" : "s"} in {facs.length} {facs.length === 1 ? "faculty or community" : "faculties and communities"}. Open one to see its items.</p>{init[1] > 0 && <p className="mt-1 text-sm text-ink-2">Some filters were ignored: nothing matches them.</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <details data-facets open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="rounded-xl border border-line bg-surface p-3 text-sm lg:self-start"><summary className="min-h-9 cursor-pointer font-serif text-lg lg:pointer-events-none">Filter{nSel > 0 && ` (${nSel})`}</summary>
          {COL_FACETS.map(([k, label, f]) => { const o = opts(k, f), lim = k === "year" ? 8 : 12; if (o.length < 2 && !fs[k]?.length) return null; const shownO = more[k] ? o : o.slice(0, lim);
            return <div key={k} role="group" aria-label={label} className="mt-4"><h3 className="text-sm font-bold text-ink-2">{label}</h3>
              <p className="mt-2 flex flex-wrap gap-2">{shownO.map(([v, c]) => <Chip key={v} on={!!fs[k]?.includes(v)} onClick={() => toggle(k, v)}>{v} <span className={fs[k]?.includes(v) ? "" : "text-ink-3"}>{c}</span></Chip>)}
              {o.length > lim && <button type="button" onClick={() => setMore((m) => ({ ...m, [k]: !m[k] }))} aria-expanded={!!more[k]} aria-label={more[k] ? `Show fewer ${label.toLowerCase()}s` : `Show all ${o.length} ${label.toLowerCase()}s`} className="min-h-9 px-2 text-link hover:underline">{more[k] ? "Fewer" : `All ${o.length}`}</button>}</p></div>; })}
          <p className="mt-4 flex min-h-9 items-center gap-3"><span role="status" className="text-ink-3">{hits} items in {list.length} collection{list.length === 1 ? "" : "s"}</span>{nSel > 0 && <button type="button" onClick={() => setFs({})} className="min-h-9 text-link hover:underline">Clear filters</button>}</p></details>
        <div>
      {list.length === 0 && <p data-nofilter className="empty">No collection has items with all of those. Remove a filter to see more.</p>}
      {facs.map((f) => <div key={f}><h2 className="mt-8 font-serif text-2xl"><Link to={"/faculty/" + slug(f)} className="hover:underline">{f || "Other"}</Link></h2>
        <ul className="mt-4 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(12rem, calc(50% - .625rem)), 1fr))" }}>{list.filter((c) => c.items[0].faculty === f).map((it) => <CollectionCard key={it.k} it={it} q={carry} />)}</ul></div>)}
        </div>
      </div>
    </section>
  );
}
// Sub-topics grouped under the top-level category most of their items carry (computed from the data, no extra file).
function subTree(S) {
  if (S.subTree) return S.subTree;
  const m = new Map();
  S.articles.forEach((a) => a.subtopics.forEach((t) => { const e = m.get(t) || { n: 0, c: {} }; e.n++; a.categories.forEach((c) => { e.c[c] = (e.c[c] || 0) + 1; }); m.set(t, e); }));
  const tree = {};
  m.forEach((e, t) => { const p = Object.entries(e.c).sort((x, y) => y[1] - x[1])[0]?.[0] || "Other"; (tree[p] = tree[p] || []).push([t, e.n]); });
  Object.values(tree).forEach((l) => l.sort((x, y) => y[1] - x[1]));
  return (S.subTree = tree);
}
function Topics() {
  const S = window.__S, cats = [...new Set(S.articles.flatMap((a) => a.categories))].map((c) => [c, S.articles.filter((a) => a.categories.includes(c))]).sort((x, y) => y[1].length - x[1].length);
  const tc = {}; S.articles.forEach((a) => a.subjects.forEach((s) => { tc[s] = (tc[s] || 0) + 1; }));
  return (
    <section className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 py-8 sm:px-8">
      <h1 className="font-serif text-3xl">Topics</h1>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{cats.map(([c, items]) => <li key={c}><Link to={"/cat/" + slug(c)} className="block h-full overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
        <div className="relative flex h-28 items-center justify-center overflow-hidden text-white" style={{ background: grad(items[0], 120) }}><Icon m={motif(items[0])} className="h-20 w-20 opacity-80" w={0.8} /></div>
        <div className="p-3"><h3 className="font-serif text-lg leading-snug">{c}</h3><p className="text-xs text-ink-3">{items.length} items</p></div></Link></li>)}</ul>
      {Object.keys(subTree(S)).length > 0 && <><h2 className="mt-10 font-serif text-2xl">Sub-topics<AiLabel /></h2>
        {cats.filter(([c]) => subTree(S)[c]).map(([c], i) => <details key={c} open={topicOpen[c] ?? i === 0} onToggle={(e) => { topicOpen[c] = e.currentTarget.open; }} className="mt-3 rounded-lg border border-line bg-surface px-3 py-1"><summary className="min-h-10 cursor-pointer py-2 text-sm font-bold text-ink-2">{c}</summary>
          <p className="mb-3 flex flex-wrap gap-2"><Link to={"/cat/" + slug(c)} className="rounded-full border border-line px-3 py-1 text-sm text-link hover:underline">All {c} items</Link>{subTree(S)[c].map(([t, n]) => <Link key={t} to={"/sub/" + slug(t)} className="rounded-full bg-navy-soft px-3 py-1 text-sm font-medium text-navy hover:underline">{t} <span className="opacity-60">{n}</span></Link>)}</p></details>)}</>}
      <h2 className="mt-10 font-serif text-2xl">Popular tags</h2>
      <p className="mt-3 flex flex-wrap gap-2">{Object.entries(tc).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 60).map(([s, n]) => <Link key={s} to={tagTo(s)} className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-2 hover:border-action-2 hover:text-action">{s} <span className="opacity-60">{n}</span></Link>)}</p>
    </section>
  );
}

// Floating nudge on the home page: there is a lot more below the hero. Stays until the footer comes into view.
function ScrollHint() {
  const [top, setTop] = useState(true), consent = useConsent();
  useEffect(() => { const f = document.querySelector("footer"); if (!f || !("IntersectionObserver" in window)) return; const io = new IntersectionObserver(([e]) => setTop(!e.isIntersecting)); io.observe(f); return () => io.disconnect(); }, []);
  if (!top || !consent) return null; // the cookie banner sits at the bottom until the visitor chooses: never both
  const go = () => scrollTo({ top: scrollY + innerHeight * 0.85, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return <button type="button" onClick={go} className="fixed bottom-5 left-1/2 z-30 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-action-fill px-5 py-2 text-sm font-bold text-white shadow-xl ring-2 ring-white transition hover:bg-action-2-fill"><span>Scroll for more collections and items</span><span aria-hidden="true" className="hint-bob">↓</span></button>;
}
// First-visit tour: three short steps. Its dismissal is a preference, so it is kept on the device only with "prefs" consent (memory otherwise).
const TOUR = [["Search", "Type a topic or a question in the box above; suggestions appear as you type.", "/search"], ["Advanced", "Combine categories, tags, authors and years: Required, Expand, Boost and Exclude.", "/advanced"], ["Maps and view lists", "See how items connect on the relationship map, and collect items in view lists with +.", "/maps"]];
function Tour() {
  const [n, setN] = useState(() => (pref.get("upou-tour") ? -1 : 0));
  if (n < 0) return null;
  const done = () => { pref.set("upou-tour", "1"); setN(-1); }, [h, t, to] = TOUR[n];
  return (
    <section aria-label="Quick tour" onKeyDown={(e) => { if (e.key === "Escape") done(); }} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-ink-3">Quick tour · step {n + 1} of {TOUR.length}</p>
        <button type="button" onClick={done} className="-my-3 -mr-2 min-h-10 px-2 text-sm text-link hover:underline">Skip tour</button></div>
      <h2 className="mt-1 font-serif text-xl">{h}</h2><p className="mt-1 text-sm text-ink-2">{t} <Link to={to} className="text-link underline">Open {h.split(" ")[0]}</Link></p>
      <div className="mt-3 flex flex-wrap gap-2">{n > 0 && <button type="button" onClick={() => setN(n - 1)} className="min-h-10 rounded-full border border-line px-4 text-sm">Back</button>}
        {n < TOUR.length - 1 ? <button type="button" onClick={() => setN(n + 1)} className="min-h-10 rounded-full bg-action-fill px-4 text-sm font-bold text-white hover:bg-action-2-fill">Next</button> : <button type="button" onClick={done} className="min-h-10 rounded-full bg-action-fill px-4 text-sm font-bold text-white hover:bg-action-2-fill">Done</button>}</div>
    </section>
  );
}
// own state, so a keystroke re-renders the box and not the whole catalogue below it (1000 records: 450 ms frames)
function HomeSearch() { const [q, setQ] = useState(""); return <SearchBox value={q} onChange={setQ} placeholder="Search titles, authors, abstracts, topics…" className="w-full" />; }
function Browse() {
  const S = window.__S, [mode, setMode] = useState("collection"), [full, setFull] = useState(false);
  useEffect(() => { const t = setTimeout(() => setFull(true), 400); return () => clearTimeout(t); }, []); // first 3 shelves now, the rest once idle (R227)
  const lim = (l) => full ? l : l.slice(0, 3);
  const arts = [...S.articles].sort((x, y) => y.year - x.year), withAbs = arts.filter((a) => a.abstract);
  const by2 = (get) => { const m = new Map(); arts.forEach((a) => get(a).forEach((k) => k && (m.get(k) || m.set(k, []).get(k)).push(a))); return [...m].sort((x, y) => y[1].length - x[1].length); };
  const cols = colList(), facs = by2((a) => [a.faculty]), types = by2((a) => [a.type]), cats = by2((a) => a.categories), topics = by2((a) => a.subjects).filter(([, l]) => l.length >= 3);
  const modes = [["collection", "By collection"], ["faculty", "By faculty"], ["type", "By type"], ...(cats.length ? [["category", "By topic"]] : []), ...(topics.length ? [["topic", "By tag"]] : [])];
  return (
    <>
      <Hero items={withAbs.length ? withAbs : arts} />
      <ScrollHint />
      <div className="mx-auto flex max-w-6xl min-[1536px]:max-w-[88rem] flex-col gap-3 px-4 pt-8 sm:px-8">
        <p data-orient className="text-ink-2">Search {S.articles.length} theses, student papers, articles and presentations from UP Open University. Type a topic, an author or a question. Try:{["distance learning", "online learning", "teacher training"].map((x) => <span key={x}> <Link to={"/search/" + encodeURIComponent(x)} className="text-link underline">{x}</Link></span>)}. Full texts stay in the official repository; each record links there.</p>
        <HomeSearch />
        <Tour />
      </div>
      <div className="mt-4">
        <section className="band"><Row title="Collections" items={cols.slice(0, 12)} to="/collections" sub="shelves of theses, papers and articles" render={(it) => <CollectionCard key={it.k} it={it} />} /></section>
        <div className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 pt-6 sm:px-8">
          <div role="group" aria-label="Organize by" className="flex flex-wrap self-start rounded-3xl border border-line bg-surface p-1 text-sm">
          {modes.map(([k, l]) => <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className={`rounded-full px-4 py-1.5 font-medium ${mode === k ? "bg-action-fill text-white" : "text-ink-2"}`}>{l}</button>)}
        </div>
        </div>
        <section className="band"><Row title="Newest items" items={arts.slice(0, 12)} sub="most recent first" /></section>
        {mode === "collection" && lim(cols).map((c) => <section className="band" key={c.k}><Row title={c.label} items={c.items} to={"/collection/" + c.k} sub={`${c.items.length} items · ${c.items[0].faculty}`} /></section>)}
        {mode === "faculty" && lim(facs).map(([g, items]) => <section className="band" key={g}><Row title={g} items={items} to={"/faculty/" + slug(g)} /></section>)}
        {mode === "type" && lim(types).map(([g, items]) => <section className="band" key={g}><Row title={g} items={items} to={"/type/" + slug(g)} /></section>)}
        {mode === "category" && lim(cats).map(([g, items]) => <section className="band" key={g}><Row title={g} items={items} to={"/cat/" + slug(g)} /></section>)}
        {mode === "topic" && lim(topics).map(([g, items]) => <section className="band" key={g}><Row title={g} items={items} to={tagTo(g)} /></section>)}
      </div>
    </>
  );
}
export function Crumbs({ trail }) {
  return <nav aria-label="Breadcrumb" className="text-sm print:hidden"><ol className="flex flex-wrap gap-x-1.5 text-ink-3">{trail.map(([to, l], i) => <li key={i}>{i > 0 && <span aria-hidden="true">› </span>}{to ? <Link to={to} className="text-link hover:underline">{l}</Link> : <span aria-current="page">{l}</span>}</li>)}</ol></nav>;
}
function Group({ kind, id, pre = "" }) {
  const S = window.__S, d = dec(id || ""), P0 = new URLSearchParams(dec(pre)), wide = kind === "collection" || kind === "faculty", [yr, setYr] = useState(() => wide ? +P0.get("year") || 0 : 0), [fs, setFs] = useState(() => { const o = {}; for (const [k, v] of P0) if (k !== "year" && wide && ["type", "cat", "sub", "tag"].includes(k)) (o[k] ||= []).push(v); return o; }), [more, setMore] = useState({});
  const test = { year: (a) => String(a.year) === d, collection: (a) => colKey(a) === d, faculty: (a) => slug(a.faculty) === d, type: (a) => slug(a.type) === d, tag: (a) => a.subjects.includes(d), cat: (a) => a.categories?.some((c) => slug(c) === d), sub: (a) => a.subtopics.some((c) => slug(c) === d) }[kind];
  const items = S.articles.filter(test).sort((x, y) => y.year - x.year);
  const title = kind === "year" ? (items.length ? `Items from ${d}` : "No items for that year") : kind === "collection" ? items[0]?.collection || "Collection not found" : kind === "faculty" ? items[0]?.faculty || "Faculty not found" : kind === "type" ? items[0]?.type || "Type not found" : kind === "tag" ? d : kind === "sub" ? S.articles.flatMap((a) => a.subtopics).find((c) => slug(c) === d) || "Sub-topic" : S.articles.flatMap((a) => a.categories || []).find((c) => slug(c) === d) || "Category";
  const FACETS = kind === "collection" || kind === "faculty" ? [["type", "Type", (a) => [a.type]], ["cat", "Topic", (a) => a.categories], ["sub", "Sub-topic", (a) => a.subtopics], ["tag", "Tag", (a) => a.subjects]] : [];
  // every selected value must match (AND); counts for a facet ignore that facet's own selection so its other values stay pickable
  const pass = (a, skip) => (!yr || a.year === yr) && FACETS.every(([k, , f]) => k === skip || !fs[k]?.length || fs[k].every((v) => f(a).includes(v)));
  const facetOpts = (k, f) => { const m = new Map(); items.filter((a) => pass(a, k)).forEach((a) => new Set(f(a)).forEach((v) => m.set(v, (m.get(v) || 0) + 1))); (fs[k] || []).forEach((v) => m.has(v) || m.set(v, 0)); return [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])); };
  const toggle = (k, v) => setFs((o) => ({ ...o, [k]: o[k]?.includes(v) ? o[k].filter((x) => x !== v) : [...(o[k] || []), v] }));
  const nSel = Object.values(fs).reduce((n, l) => n + l.length, 0);
  const shown = items.filter((a) => pass(a)), yrs = kind === "collection" || kind === "faculty" ? [...items.reduce((m, a) => m.set(a.year, (m.get(a.year) || 0) + 1), new Map())] : [];
  const subs = kind === "faculty" ? [...new Map(items.map((a) => [colKey(a), a.collection]))] : [];
  const rel = {}, rc = {}; if (kind === "tag" || kind === "cat" || kind === "sub") items.forEach((a) => a.subjects.forEach((s) => { if (s !== d) rel[s] = (rel[s] || 0) + 1; }));
  if (kind === "cat") items.forEach((a) => a.categories.forEach((c) => { if (slug(c) !== d) rc[c] = (rc[c] || 0) + 1; })); // topic hub: categories that share items with this one
    return (
    <section className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 py-8 sm:px-8">
      <Crumbs trail={[["/", "Home"], ...(kind === "collection" ? [["/collections" + (pre ? "/" + pre : ""), "Collections"], ...(items[0] ? [["/faculty/" + slug(items[0].faculty), items[0].faculty]] : [])] : ["year", "faculty", "type"].includes(kind) ? [] : [["/topics", "Topics"]]), [null, kind === "tag" ? "Tag: " + title : title]]} />
      <div className="mt-2 flex gap-5"><div>
      <h1 className="font-serif text-3xl font-light">{kind === "tag" && <span className="text-ink-3">Tag: </span>}{title}</h1>{kind === "collection" && items[0] && <p className="font-serif text-lg text-ink-2"><Link to={"/faculty/" + slug(items[0].faculty)} className="hover:underline">{items[0].faculty}</Link></p>}<p className="text-ink-3">{yr ? `${shown.length} of ${items.length}` : items.length} items{yr ? ` from ${yr}` : ""}</p>
      {kind === "cat" && (subTree(S)[title] || []).length > 0 && <p className="mt-3 flex flex-wrap gap-2 text-sm"><span className="text-ink-3">Sub-topics<AiLabel />:</span>{subTree(S)[title].map(([t, n]) => <Link key={t} to={"/sub/" + slug(t)} className="rounded-full bg-navy-soft px-3 py-0.5 font-medium text-navy hover:underline">{t} <span className="opacity-60">{n}</span></Link>)}</p>}
      {kind === "cat" && Object.keys(rc).length > 0 && <p className="mt-3 flex flex-wrap gap-2 text-sm"><span className="text-ink-3">Related topics:</span>{Object.entries(rc).sort((x, y) => y[1] - x[1]).map(([c]) => <Link key={c} to={"/cat/" + slug(c)} className="rounded-full bg-crimson-soft px-3 py-0.5 text-link hover:underline">{c}</Link>)}</p>}</div></div>
      {(kind === "tag" || kind === "cat" || kind === "sub") && Object.keys(rel).length > 0 && <p className="mt-3 flex flex-wrap gap-2 text-sm"><span className="text-ink-3">{kind === "cat" ? "Common tags:" : "Related tags:"}</span>{Object.entries(rel).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([s]) => <Link key={s} to={tagTo(s)} className="rounded-full bg-navy-soft px-3 py-0.5 text-navy hover:underline">{s}</Link>)}</p>}
      {items.length === 0 ? <div data-empty className="empty mt-6"><p>We could not find any items here. The link may be old or mistyped.</p><p className="mt-2 flex flex-wrap justify-center gap-x-4"><Link to="/collections" className="inline-flex min-h-11 items-center font-medium text-link hover:underline">Browse all collections</Link><Link to="/search" className="inline-flex min-h-11 items-center font-medium text-link hover:underline">Search all items</Link></p></div> :
      <>{subs.length > 1 && <p data-subs className="mt-3 flex flex-wrap gap-2 text-sm"><span className="text-ink-3">Collections in this faculty:</span>{subs.map(([k, l]) => <Link key={k} to={"/collection/" + k} className="rounded-full bg-navy-soft px-3 py-0.5 text-navy hover:underline">{l}</Link>)}</p>}
      {yrs.length > 1 && <div data-years role="group" aria-label="Year" className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className="text-ink-3">Year:</span><Chip on={!yr} onClick={() => setYr(0)}>All</Chip>{yrs.map(([y, c]) => <Chip key={y} on={yr === y} onClick={() => setYr(yr === y ? 0 : y)}>{y} <span className="opacity-60">{c}</span></Chip>)}</div>}
      {FACETS.length > 0 && items.length > 1 && <div data-facets className="mt-3 space-y-2 text-sm">
        {FACETS.map(([k, label, f]) => { const o = facetOpts(k, f); if (o.length < 2 && !fs[k]?.length) return null; const all = more[k] ? o : o.slice(0, 10);
          return <div key={k} role="group" aria-label={label} className="flex flex-wrap items-center gap-2"><span className="text-ink-3">{label}:</span>
            {all.map(([v, c]) => <Chip key={v} on={!!fs[k]?.includes(v)} onClick={() => toggle(k, v)}>{v} <span className="opacity-60">{c}</span></Chip>)}
            {o.length > 10 && <button type="button" onClick={() => setMore((m) => ({ ...m, [k]: !m[k] }))} aria-expanded={!!more[k]} aria-label={more[k] ? `Show fewer ${label.toLowerCase()}s` : `Show all ${o.length} ${label.toLowerCase()}s`} className="min-h-9 px-2 text-link hover:underline">{more[k] ? "Fewer" : `All ${o.length}`}</button>}</div>; })}
        {items.length > 1 && <p className="flex items-center gap-3"><span id="grp-status" tabIndex={-1} role="status" className="text-ink-3">{nSel > 0 || yr > 0 ? `${shown.length} of ${items.length} items` : `${items.length} items`}{yr > 0 && yr === +P0.getAll("year")[0] && P0.getAll("year").length > 1 ? ` (showing ${yr} of your ${P0.getAll("year").length} year picks)` : ""}</span>{(nSel > 0 || yr > 0) && <button type="button" onClick={() => { setFs({}); setYr(0); document.getElementById("grp-status")?.focus(); }} className="min-h-9 text-link hover:underline">Clear filters</button>}</p>}</div>}
      {shown.length === 0 ? <p data-nofilter className="empty mt-6">No item has all of those. Remove a filter to see more.</p> : <ul className="grid-pubs mt-6">{shown.map((a) => <Pub key={a.id} a={a} />)}</ul>}</>}
    </section>
  );
}

const hl = (t, q) => { const w = (q || "").toLowerCase().match(/[a-z0-9]{3,}/g); return w ? t.split(new RegExp("(" + w.join("|") + ")", "ig")).map((s, i) => i % 2 ? <mark key={i} className="rounded bg-sky/60 px-0.5">{s}</mark> : s) : t; };
export function Passage({ p, small, id }) {
  return p ? <div className={`border-t border-line bg-sky/20 text-left ${small ? "px-3 py-2" : "mt-3 rounded-lg border px-3 py-2"}`} role="group" aria-label="Best-fit passage">
    <p className="flex items-baseline gap-2 text-2xs font-bold uppercase tracking-wide text-ink-3">Best passage · PDF page {p.page}{id && <Link to={`/read/${id}/p/${p.page}/${encodeURIComponent(p.terms || "")}`} className="ml-auto normal-case tracking-normal text-link hover:underline">Show in item</Link>}</p>
    <p className={`mt-0.5 leading-snug text-ink-2 ${small ? "line-clamp-3 text-xs" : "text-sm"}`}>{hl(p.snip, p.terms)}</p></div> : null;
}
export const Card = memo(function Card({ a, q, qa, terms, extra }) {
  const [, tick] = useState(0);
  useEffect(() => { if (!a.abstract && !a.half) window.__S.half().then(() => tick((n) => n + 1)); }, [a.id]); // no abstract: the half-page summary stands in, so make sure half.json is loaded (/list, /advanced)
  return (
    <li draggable onDragStart={dragChip(a)} className="flex gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm transition hover:shadow-md sm:p-5">
      <Link to={"/read/" + a.id} className="pub-link hidden w-28 shrink-0 sm:block" aria-hidden="true" tabIndex={-1}><Cover a={a} small /></Link>
      <div className="min-w-0 flex-1"><Link to={"/read/" + a.id} className="font-serif text-2xl leading-snug text-link hover:underline">{hl(a.title, q)}</Link>
      <p className="mt-1 text-sm text-ink-3">{by(a)} · {a.year} · {a.type}{pagesOf(a)} · {a.collection}</p>
      <p className="mt-3 text-base leading-relaxed text-ink-2">{hl(clip(a.abstract || a.half || "", 380), q)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {a.matched?.length > 0 && <span className="rounded-full bg-crimson-soft px-2.5 py-0.5 text-link">best match: {FIELD_LABEL[a.matched[0]]}{a.matched.length > 1 ? ` +${a.matched.length - 1} more` : ""}</span>}
        <AddBtn id={a.id} className="ml-auto !bg-navy-soft" label /><Link to={"/maps/pub/" + a.id} className="font-medium text-link hover:underline">Map</Link>{a.subjects[0] && <Link to={"/maps/tag/" + encodeURIComponent(a.subjects[0])} title={`Map of topic: ${a.subjects[0]}`} className="line-clamp-1 max-w-[10rem] text-link hover:underline">Topic map</Link>}{a.authors[0] && <Link to={"/maps/author/" + encodeURIComponent(a.authors[0])} title={`Map of author: ${a.authors[0]}`} className="text-link hover:underline">Author map</Link>}<Link to={"/read/" + a.id} className="font-medium text-link hover:underline">Read →</Link>
      </div>
      <Passage p={a.passage} id={a.id} />
      {extra}
      {qa && qa !== "off" && <div className="mt-3 overflow-hidden rounded-lg border border-line"><QA a={a} mode={qa} terms={terms} /></div>}</div>
    </li>
  );
});

export function ViewToggle({ view, setView }) {
  return <div className="flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label="Result layout">{[["grid", "Big cards"], ["dense", "Compact"], ["list", "Details"]].map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`min-h-10 px-3 ${view === k ? "bg-action-fill text-white" : "bg-surface text-ink-2"}`}>{l}</button>)}</div>;
}
// A chunk that fails to load (stale hash after a deploy, flaky network) gets one automatic reload instead of a blank page.
/* intros live in the entry so the lazy-route fallbacks paint the LCP text before the chunk arrives */
export const AdvIntro = () => <p className="mt-1 text-sm text-ink-2"><b>Required</b> must all match, <b>Expand</b> also includes any of these (or, set to “at least one of these”, becomes <b>Additional</b>: results must match one of them), <b>Boost</b> ranks matches higher (first listed most), <b>Exclude</b> leaves them out. Drag chips between areas (or use the ⇄ on a chip), and drag any result card into an area to filter by that item (or, in Details, use the item’s ＋). Undo with Ctrl+Z.</p>;
export const MapsIntro = () => <p className="mt-1 text-sm text-ink-2">Pick an item, topic or author and see what it connects to. Click a node for details, or Tab to a node and use the arrow keys. Hover a line to see why two nodes connect. 3D: drag to rotate, scroll to zoom, right-drag to pan. 2D: drag to pan, scroll to zoom.</p>;
export const lazyRetry = (load, pick = (m) => m) => lazy(() => load().then((m) => ({ default: pick(m) })).catch((e) => {
  const k = "upou-chunk-retry";
  try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); location.reload(); return new Promise(() => {}); } sessionStorage.removeItem(k); } catch { /* storage blocked: just fail */ }
  throw e;
}));
const LOAD = { "/advanced": () => import("./Advanced.jsx"), "/maps": () => import("./Maps.jsx"), "/advisers": () => (import("./Login.jsx").catch(() => {}), import("./Advisers.jsx")) }; // also fetched on tab hover/focus/touch (intent)
const Privacy = lazyRetry(() => import("./Legal.jsx"), (m) => m.Privacy), About = lazyRetry(() => import("./Legal.jsx"), (m) => m.About);
const Advanced = lazyRetry(LOAD["/advanced"], (m) => m.Advanced);
const Maps = lazyRetry(LOAD["/maps"], (m) => m.Maps);
const Advisers = lazyRetry(LOAD["/advisers"], (m) => m.Advisers);
const AdviserPage = lazyRetry(LOAD["/advisers"], (m) => m.AdviserPage);
const AdvFallback = <div className="skeleton mt-4 h-[60vh]" role="status" aria-label="Loading" />;
// R216/R217: lists, the shortcut dialog and the login form (with its PBKDF2 code) load on first use
const SharedList = lazyRetry(() => import("./Lists.jsx"), (m) => m.SharedList), MyList = lazyRetry(() => import("./Lists.jsx"), (m) => m.MyList), KeyHelp = lazyRetry(() => import("./Legal.jsx"), (m) => m.KeyHelp);
const Login = lazyRetry(() => import("./Login.jsx"), (m) => m.Login);
function Gate({ children, on = true }) { const { open } = useAccess(); return open || !on ? children : <Suspense fallback={AdvFallback}><Login /></Suspense>; }
function LockButton() {
  const { open, dev } = useAccess();
  return open && !dev ? <button type="button" onClick={() => { lock(); location.hash = "#/"; }} data-lock className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium text-white/90 hover:bg-white/10">Lock</button> : null;
}
// Which collections the results come from: counted links.
export function ResultCollections({ rows }) {
  const n = new Map(); rows.forEach((a) => { const k = colKey(a); n.set(k, [a.collection, (n.get(k)?.[1] || 0) + 1]); });
  const top = [...n].sort((x, y) => y[1][1] - x[1][1]).slice(0, 8);
  if (!top.length) return null;
  return (
    <section aria-label="Collections in these results" className="mb-5 rounded-xl border border-line bg-surface p-3">
      <h2 className="text-2xs font-bold uppercase tracking-wide text-ink-3">Collections in these results ({n.size})</h2>
      <ul className="mt-2 flex flex-wrap gap-2">{top.map(([k, [l, c]]) => <li key={k}><Link to={"/collection/" + k} className="inline-flex min-h-9 items-center rounded-full bg-navy-soft px-3 text-sm text-navy hover:underline">{l} <span className="ml-1 opacity-70">{c}</span></Link></li>)}</ul>
    </section>);
}
const PAGE = 24;
const SCOPES = [["title", "Title & authors"], ["abstract", "Abstract"], ["half,one,two", "Full content"]];
function Chip({ on, onClick, children }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={`min-h-10 rounded-full border px-3.5 py-1.5 text-sm transition ${on ? "border-action bg-action-fill text-white" : "border-line bg-surface text-ink-2 hover:border-action-2 hover:text-action"}`}>{on && <Icon m="check" w={2.5} className="mr-1 inline h-4 w-4 align-[-2px]" />}{children}</button>;
}
const kept = {}; // filters per search query, so Back from an item restores them (memory only)
function Search({ q0, y0 }) {
  const K = kept[q0 || ""] || {};
  const all = window.__S.articles;
  // round 47: derived from the 785 items only, so computed once per data load, not on every keystroke/click
  const { years, cats, cols, facs } = useMemo(() => ({ years: [...new Set(all.map((a) => a.year))].sort((x, y) => x - y), cats: [...new Set(all.flatMap((a) => a.categories))].sort(), cols: new Map(all.map((a) => [colKey(a), a.collection])), facs: [...new Set(all.map((a) => a.faculty).filter(Boolean))].sort() }), [all]);
  const [q, setQ] = useState(q0 || ""), [base, setBase] = useState(null);
  const [scope, setScope] = useState(K.scope || SCOPES.flatMap((s) => s[0].split(","))), [cat, setCat] = useState(K.cat || []), [subj, setSubj] = useState(K.subj || []);
  const clampY = (y, d) => (y ? Math.min(Math.max(y, +years[0]), +years.at(-1)) : +d), [y1, y2] = [clampY(y0?.from, years[0]), clampY(y0?.to, years.at(-1))].sort((x, y) => x - y);
  const [from, setFrom] = useState(K.from || y1), [to, setTo] = useState(K.to || y2), [author, setAuthor] = useState(K.author || ""), [sort, setSort] = useState(K.sort || "relevance"), [view, setView] = useState("grid");
  const [open, setOpen] = useState(() => matchMedia("(min-width:1024px)").matches), [allSubj, setAllSubj] = useState(false), [last, setLast] = useState("");
  const [err, setErr] = useState(false);
  const run = async (raw) => { const text = parseQuery(raw).text.slice(0, 300); setErr(false); try { setBase(text ? await searchArticles(text, { k: 200, fields: scope.join(",").split(",") }) : (await Promise.all([window.__S.textsP, window.__S.half()]), all.map((a) => ({ ...a, matched: [] })))); } catch { setErr(true); setBase([]); } };
  useEffect(() => { setQ(q0 || ""); run(q0 || ""); setShown(PAGE); }, [q0, scope]);
  const ms = useModel().s; useEffect(() => { if (ms === "ready" && q0) run(q0); }, [ms]); // re-rank once the vectors are in
  const [col, setCol] = useState(K.col || ""), [fac, setFac] = useState(K.fac || ""), [typ, setTyp] = useState(K.typ || []), [shown, setShown] = useState(PAGE);
  kept[q0 || ""] = { scope, cat, subj, from, to, author, sort, col, fac, typ };
  const au = author.trim().toLowerCase(), pq = parseQuery(q0);
  // The count is the Boolean predicate (boolq.js) over every item, not a top-k cut: hybrid-ranked matches first, then the rest by year.
  const bq = useMemo(() => parseBool(pq.bool), [q0]);
  const inB = useMemo(() => base && bq.ast ? new Set(all.filter((a) => matchBool(bq.ast, hayOf(a, scope))).map((a) => a.id)) : null, [base, bq]);
  // Plain words that no item has all of (a question, say) are not a dead end: keep the ranking by meaning and say so.
  // A query with operators or quotes stays strict: zero is zero, and the count says so.
  const soft = !!inB && bq.plain && inB.size === 0 && base.length > 0;
  const src = useMemo(() => { if (!inB || soft) return base; const got = new Set(base.map((a) => a.id));
    return [...base.filter((a) => inB.has(a.id)), ...all.filter((a) => inB.has(a.id) && !got.has(a.id)).sort((x, y) => y.year - x.year).map((a) => ({ ...a, matched: [] }))]; }, [base, inB, soft]);
  const P = { op: (a) => (!pq.y || (a.year >= pq.y[0] && a.year <= pq.y[1])) && (!pq.author || by(a).toLowerCase().includes(pq.author)), year: (a) => a.year >= from && a.year <= to, au: (a) => !au || (by(a) + " " + a.advisers.join(" ")).toLowerCase().includes(au), subj: (a) => !subj.length || subj.every((s) => a.subjects.includes(s)), collection: (a) => !col || colKey(a) === col, fac: (a) => !fac || a.faculty === fac, typ: (a) => !typ.length || typ.includes(a.type), cat: (a) => !cat.length || a.categories.some((c) => cat.includes(c)) };
  // Facet lists show only what the other filters leave; the facet clicked last also ignores its own filter so more can be picked from it.
  const match = (skip) => (src || []).filter((a) => Object.entries(P).every(([k, f]) => k === skip || f(a)));
  const pre = match("cat"), res = pre.filter(P.cat);
  const list = sort === "newest" || (sort === "relevance" && !q0) ? [...res].sort((x, y) => y.year - x.year) : sort === "oldest" ? [...res].sort((x, y) => x.year - y.year) : sort === "title" ? [...res].sort((x, y) => x.title.localeCompare(y.title)) : res;
  const count = {}; pre.forEach((a) => a.categories.forEach((c) => { count[c] = (count[c] || 0) + 1; }));
  const sc = {}; match(last === "subj" ? "subj" : "").forEach((a) => a.subjects.forEach((s) => { sc[s] = (sc[s] || 0) + 1; }));
  const subjects = Object.entries(sc).sort((x, y) => y[1] - x[1]).slice(0, allSubj ? 60 : 14).map((x) => x[0]);
  const tog = (arr, set, v, f) => { setLast(f); set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]); };
  const tcount = {}, fcount = {}, fix = base && base.length <= 3 && pq.text ? didYouMean(pq.text) : null;
  match("fac").forEach((a) => { fcount[a.faculty] = (fcount[a.faculty] || 0) + 1; });
  match("typ").forEach((a) => { tcount[a.type] = (tcount[a.type] || 0) + 1; });
  const without = (raw) => "/search/" + encodeURIComponent(q0.replace(raw, " ").replace(/\s+/g, " ").trim());
  const topId = (q0 || cat.length || subj.length || au) && list[0]?.id; // the logo emblem opens the map from the top result while filters are set
  useEffect(() => { window.__top = topId || null; return () => { window.__top = null; }; }, [topId]);
  const [, bump] = useState(0), isSaved = q0 && saved().includes(q0);
  const toggleSave = () => { store("upou-saved", isSaved ? saved().filter((x) => x !== q0) : [q0, ...saved()].slice(0, 20)); bump((n) => n + 1); };
  const authors = [...new Set(match("au").flatMap((a) => a.authors))].sort();
  const shownCats = last === "cat" || !cat.length ? cats.filter((c) => count[c] || cat.includes(c)) : cats.filter((c) => match("").some((a) => a.categories.includes(c)) || cat.includes(c));
  const yrs = new Set(match("year").map((a) => a.year)), shownYears = years.filter((y) => yrs.has(y) || +y === +from || +y === +to);
  const active = [...cat.map((c) => [c, () => tog(cat, setCat, c, "cat")]), ...subj.map((s) => [s, () => tog(subj, setSubj, s, "subj")]), ...(au ? [["Author: " + author, () => setAuthor("")]] : []), ...typ.map((t) => [t, () => tog(typ, setTyp, t, "typ")]), ...(fac ? [[fac, () => setFac("")]] : []), ...(col ? [[cols.get(col), () => setCol("")]] : []), ...(from > years[0] || to < years.at(-1) ? [[`${from}–${to}`, () => { setFrom(years[0]); setTo(years.at(-1)); }]] : [])];
  const reset = () => { setCat([]); setSubj([]); setAuthor(""); setCol(""); setFac(""); setTyp([]); setFrom(years[0]); setTo(years.at(-1)); setScope(SCOPES.flatMap((s) => s[0].split(","))); };
  const lab = "mb-2 block text-xs font-bold uppercase tracking-wide text-ink-3";
  return (
    <section className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-xl">
      <div className="bg-navy-fill px-4 pb-6 pt-8 text-white sm:px-8">
        <h1 className="font-serif text-3xl">Search</h1>
        <p className="mt-1 text-white/75">Search all {all.length} items; matches in a title count most, then the abstract, then the summaries of the paper. Open the item for the full text at the UPOU Repository.</p>
        <SearchBox value={q} onChange={setQ} placeholder="Keywords or a question, e.g. online learning readiness" className="mt-4" btn="bg-action-2-fill hover:bg-action-fill" />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="text-white/70">Search in:</span>
          {SCOPES.map(([k, l]) => { const on = scope.includes(k.split(",")[0]); return <button type="button" key={k} aria-pressed={on} onClick={() => { const f = k.split(","); const next = on ? scope.filter((x) => !f.includes(x)) : [...scope, ...f]; if (next.length) setScope(next); }} className={`min-h-11 rounded-full border px-4 ${on ? "border-sky bg-sky text-navy font-bold" : "border-white/50 text-white hover:bg-white/10"}`}>{on ? "✓ " : ""}{l}</button>; })}
        </div>
      </div>
      <div className="px-4 pt-5 sm:px-0 lg:grid lg:grid-cols-[17rem_1fr] lg:gap-8">
        <aside aria-label="Filters" className="mb-6 lg:mb-0">
          <button type="button" className="mb-3 min-h-11 w-full rounded-md border border-line bg-surface px-4 py-2 text-left font-bold text-ink lg:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>Filters {active.length ? `(${active.length})` : ""} {open ? "▴" : "▾"}</button>
          <div className={`${open ? "" : "hidden"} space-y-6 rounded-xl border border-line bg-surface p-4 lg:block`}>
            <div><span className={lab}>Category</span><div className="flex flex-wrap gap-1.5">{shownCats.map((c) => <Chip key={c} on={cat.includes(c)} onClick={() => tog(cat, setCat, c, "cat")}>{c} <span className="opacity-60">{count[c] || 0}</span></Chip>)}</div></div>
            <div><span className={lab}>Year</span><div className="flex items-center gap-2">
              <select value={from} onChange={(e) => { const v = +e.target.value; setFrom(v); if (v > to) setTo(v); }} aria-label="From year" className="flex-1 rounded-md border border-line px-2 py-1.5">{shownYears.map((y) => <option key={y}>{y}</option>)}</select>–
              <select value={to} onChange={(e) => { const v = +e.target.value; setTo(v); if (v < from) setFrom(v); }} aria-label="To year" className="flex-1 rounded-md border border-line px-2 py-1.5">{shownYears.map((y) => <option key={y}>{y}</option>)}</select></div></div>
            <div><label className={lab} htmlFor="au">Author</label><input id="au" list="authors" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Type a name" className="w-full rounded-md border border-line px-3 py-1.5" /><datalist id="authors">{authors.map((x) => <option key={x} value={x} />)}</datalist></div>
            <div><span className={lab}>Type</span><div className="flex flex-wrap gap-1.5">{TYPES.filter((t) => tcount[t] || typ.includes(t)).map((t) => <Chip key={t} on={typ.includes(t)} onClick={() => tog(typ, setTyp, t, "typ")}>{t} <span className="opacity-60">{tcount[t] || 0}</span></Chip>)}</div></div>
            <div><label className={lab} htmlFor="fac">Faculty</label><select id="fac" value={fac} onChange={(e) => setFac(e.target.value)} className="w-full rounded-md border border-line px-2 py-1.5"><option value="">All faculties</option>{facs.map((f) => <option key={f} value={f}>{f} ({fcount[f] || 0})</option>)}</select></div>
            <div><label className={lab} htmlFor="col">Collection</label><select id="col" value={col} onChange={(e) => setCol(e.target.value)} className="w-full rounded-md border border-line px-2 py-1.5"><option value="">All collections</option>{[...cols].sort((x, y) => x[1].localeCompare(y[1])).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><span className={lab}>Tags</span><div className="flex flex-wrap gap-1.5">{subjects.map((s) => <Chip key={s} on={subj.includes(s)} onClick={() => tog(subj, setSubj, s, "subj")}>{s}</Chip>)}</div>
              <button type="button" className="mt-2 text-sm text-link hover:underline" onClick={() => setAllSubj(!allSubj)}>{allSubj ? "Fewer" : "More tags"}</button></div>
            {active.length > 0 && <button type="button" onClick={reset} className="text-sm font-medium text-link hover:underline">Clear all filters</button>}
          </div>
        </aside>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-ink-2" role="status" aria-atomic="true">{q0 ? <><b>{list.length}</b>{countLine(list.length, q0, from, to).replace(/^\d+/, "")}</> : <><b>{list.length}</b> of {all.length} items</>}<span className="sr-only">{active.length ? `, ${active.length} filter${active.length > 1 ? "s" : ""}` : ""}, sorted by {{ relevance: q0 ? "relevance" : "default order", newest: "newest first", oldest: "oldest first", title: "title A to Z" }[sort]}</span></p>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="min-h-10 rounded-md border border-line bg-surface px-2 py-1.5 text-sm"><option value="relevance">{q0 ? "Most relevant" : "Newest first (default)"}</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></select>
            {q0 && <button type="button" aria-pressed={!!isSaved} onClick={toggleSave} title={allow("prefs") ? "Saved on this device" : "Saved for this visit; allow search history and settings in Cookie settings to keep it"} className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm text-link hover:bg-navy-soft disabled:opacity-40">{isSaved ? "★ Saved" : "☆ Save search"}</button>}
            <ViewToggle view={view} setView={setView} />
            {q0 && <ExportBtns rows={list} />}
          </div>
          {bq.note && <p role="status" className="mb-3 text-sm text-ink-2">{bq.note}</p>}
          {pq.ops.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" aria-label="Query operators"><span className="text-ink-3">Query:</span>{pq.ops.map(([l, raw]) => <Link key={raw} to={without(raw)} aria-label={"Remove " + l} className="rounded-full border border-action-2/40 bg-crimson-soft px-3 py-1 text-link hover:underline">{l} ×</Link>)}</div>}
          {soft && <p role="status" className="mb-3 text-sm text-ink-2">No item contains all of these words, so these are the closest by meaning{ms === "ready" ? " (ranked with the language model)" : ""}.</p>}
          {!q0 && (saved().length > 0 || recents().length > 0) && <div className="mb-4 space-y-2 text-sm">{[["Saved searches", saved(), "upou-saved"], ["Recent searches", recents(), "upou-recent"]].map(([h, l, k]) => l.length > 0 && <p key={k} className="flex flex-wrap items-center gap-2"><span className="text-ink-3">{h}:</span>{l.map((x) => <span key={x} className="inline-flex items-center"><Link to={"/search/" + encodeURIComponent(x)} className="rounded-full bg-navy-soft px-3 py-0.5 text-navy hover:underline">{x}</Link>{k === "upou-recent" && <button type="button" aria-label={"Remove recent search " + x} onClick={() => { store(k, l.filter((y) => y !== x)); bump((n) => n + 1); }} className="inline-flex min-h-9 min-w-9 items-center justify-center text-link">×</button>}</span>)}<button type="button" onClick={() => { store(k, []); bump((n) => n + 1); }} className="min-h-9 px-1 text-link hover:underline">{k === "upou-saved" ? "Clear saved" : "Clear history"}</button></p>)}</div>}
          {active.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{active.map(([l, f]) => <button key={l} type="button" onClick={f} className="rounded-full bg-navy-soft px-3 py-1 text-sm text-navy hover:bg-sky/50" aria-label={"Remove filter " + l}>{l} ×</button>)}</div>}
          {fix && <p className="mb-4 rounded-md bg-navy-soft px-4 py-2 text-sm">Did you mean <Link to={"/search/" + encodeURIComponent(fix)} className="font-bold text-link underline">{fix}</Link>?</p>}
          {!q0 && <p className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="text-ink-3">Popular tags:</span>{Object.entries(sc).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([s]) => <Link key={s} to={tagTo(s)} className="rounded-full bg-navy-soft px-3 py-0.5 text-navy hover:underline">{s}</Link>)}</p>}
          {err ? <div role="alert" className="rounded-xl border border-dashed border-line p-10 text-center text-ink-2"><p>The search data could not be loaded. Check your connection and try again.</p><button type="button" onClick={() => run(q0 || "")} className="mt-2 min-h-11 font-medium text-link hover:underline">Retry</button></div>
            : base === null ? <p role="status" className="rounded-xl border border-dashed border-line p-10 text-center text-ink-3">Searching…</p>
            : list.length === 0 ? <div className="rounded-xl border border-dashed border-line p-10 text-center text-ink-2"><p>Nothing found{q ? ` for “${q}”` : ""}. Try fewer or different words, or widen the search:</p>
              <p className="mt-2 flex flex-wrap justify-center gap-x-4">{scope.length < SCOPES.flatMap((s) => s[0].split(",")).length && <button type="button" onClick={() => setScope(SCOPES.flatMap((s) => s[0].split(",")))} className="min-h-11 font-medium text-link hover:underline">Search in all fields</button>}
              {active.length > 0 && <button type="button" onClick={() => { const sc = scope; reset(); setScope(sc); }} className="min-h-11 font-medium text-link hover:underline">Clear {active.length} filter{active.length > 1 ? "s" : ""}</button>}
              {pq.ops.length > 0 && <Link to={"/search/" + encodeURIComponent(pq.text)} className="inline-flex min-h-11 items-center font-medium text-link hover:underline">Drop the query operators</Link>}
              {fix && <Link to={"/search/" + encodeURIComponent(fix)} className="inline-flex min-h-11 items-center font-medium text-link hover:underline">Search “{fix}”</Link>}
              <button type="button" onClick={reset} className="min-h-11 font-medium text-link hover:underline">Reset search and filters</button></p>
              <p className="mt-2 flex flex-wrap justify-center gap-2 text-sm"><span className="text-ink-3">Or browse a popular tag:</span>{Object.entries(all.flatMap((a) => a.subjects).reduce((m, t) => ((m[t] = (m[t] || 0) + 1), m), {})).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([t]) => <Link key={t} to={tagTo(t)} className="rounded-full bg-navy-soft px-3 py-0.5 text-navy hover:underline">{t}</Link>)}</p></div>
            : <>{q0 && <ResultCollections rows={list} />}{view !== "list" ? <ul className={"grid-pubs" + (view === "dense" ? " dense" : "")}>{list.slice(0, shown).map((a) => <Pub key={a.id} a={a} />)}</ul> : <ol className="cv-list space-y-4">{list.slice(0, shown).map((a) => <Card key={a.id} a={a} q={q0} />)}</ol>}</>}
          {list.length > shown && <div className="mt-6 text-center"><button type="button" onClick={() => setShown(shown + PAGE)} className="rounded-md bg-action-fill px-6 py-2.5 font-bold text-white hover:bg-action-2-fill">Show more ({list.length - shown} left)</button></div>}
        </div>
      </div>
    </section>
  );
}

const LENS = [["half", "Half page"], ["one", "1 page"], ["two", "2 pages"]];
// Abstract by default; the three AI summaries sit behind a toggle, with the disclaimer on top.
const NO_CITE = "Never cite from the AI-generated questions and answers. Check the item itself before citing it.";
export function AiLabel() {
  return <abbr title={NO_CITE} tabIndex={0} aria-label={"AI-generated. " + NO_CITE} className="ml-1 inline-block cursor-help rounded bg-amber-100 px-1 text-2xs font-bold uppercase no-underline text-amber-950">AI</abbr>;
}
// Tags from the repository first, then the AI-generated tags and sub-topics, each row labelled.
const countOf = (S, key, get) => { const m = (S[key] = S[key] || S.articles.reduce((m, x) => { get(x).forEach((t) => m.set(t, (m.get(t) || 0) + 1)); return m; }, new Map())); return (t) => m.get(t) || 0; };
// Adviser names come from the approval sheet (not AI). An adviser with one item is plain text; the link would list only this item.
function Advisers_({ a }) {
  const { open } = useAccess();
  if (!open) return null; // adviser names are restricted: they arrive only after login (encrypted data)
  const advN = countOf(window.__S, "advN", (x) => x.advisers);
  return a.advisers.length > 0 ? <p className="mt-1 text-sm text-ink-2"><span className="text-ink-3">{a.advisers.length > 1 ? "Advisers" : "Adviser"}:</span> {a.advisers.map((n, i) => <span key={n}>{i > 0 && "; "}{advN(n) > 1 ? <Link to={"/adviser/" + slug(n)} className="text-link hover:underline">{withTitle(window.__S, n)}</Link> : withTitle(window.__S, n)}</span>)}</p> : null;
}
function ItemTags({ a }) {
  const S = window.__S, tagN = countOf(S, "tagN", (x) => x.subjects), subN = countOf(S, "subN", (x) => x.subtopics);
  // a tag only this item has would link to a page listing just this item: plain text there
  const Ch = ({ n, to, className, children }) => { const t = [].concat(children).join(""), c = t.length > 37 ? className + " inline-block max-w-[37ch] truncate align-bottom" : className, ti = t.length > 37 ? t : undefined; // # plus 36 characters
    return n > 1 ? <Link to={to} className={c} title={ti}>{children}</Link> : <span className={c.replace(/ hover:\S+/g, "")} title={ti}>{children}</span>; };
  const au = new Set(a.autoTags), chip = "rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-2 hover:border-action-2 hover:text-action";
  const own = a.subjects.filter((s) => !au.has(s)), auto = a.subjects.filter((s) => au.has(s));
  return (<div className="mt-3 space-y-1.5">
    {own.length > 0 && <div className="flex flex-wrap gap-1.5">{own.map((s) => <Ch key={s} n={tagN(s)} to={tagTo(s)} className={chip}>#{s}</Ch>)}</div>}
    {a.subtopics.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-ink-3">Sub-topics<AiLabel /></span>{a.subtopics.map((s) => <Ch key={s} n={subN(s)} to={"/sub/" + slug(s)} className="rounded-full bg-navy-soft px-2.5 py-0.5 text-xs font-medium text-navy hover:underline">{s}</Ch>)}</div>}
    {auto.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-ink-3">Auto tags<AiLabel /></span>{auto.map((s) => <Ch key={s} n={tagN(s)} to={tagTo(s)} className={chip}>#{s}</Ch>)}</div>}
  </div>);
}
function NoCite({ what = "AI summary", className = "" }) {
  return <p role="note" className={`rounded-md border-l-4 border-amber-500 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950 ${className}`}>Never cite from the {what}. Check the item itself before citing it.</p>;
}
function Cite({ a }) {
  const [state, setState] = useState("idle"), [st, setSt] = useState(() => { try { return STYLES.some(([k]) => k === pref.get("upou-cite")) ? pref.get("upou-cite") : "apa"; } catch { return "apa"; } });
  const pick = (k) => { setSt(k); try { pref.set("upou-cite", k); } catch { /* no consent / private mode */ } };
  const text = styleText(a, st);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setState("copied"); setTimeout(() => setState("idle"), 2000); } catch { setState("manual"); } };
  return (
    <section aria-label="How to cite" className="mb-5 max-w-2xl rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2"><h2 className="text-2xs font-bold uppercase tracking-wide text-ink-3">How to cite</h2>
        <button type="button" onClick={copy} aria-label="Copy citation" title="Copy citation" className="grid min-h-9 min-w-9 place-items-center rounded-md px-2 text-sm font-medium text-link hover:bg-navy-soft">{state === "copied" ? "Copied ✓" : <Icon m="copy" w={2} className="h-[18px] w-[18px]" />}</button>
        <div role="group" aria-label="Citation style" className="ml-auto flex overflow-hidden rounded-md border border-line text-xs">{STYLES.map(([k, l]) => <button key={k} type="button" aria-pressed={st === k} onClick={() => pick(k)} className={`min-h-9 px-2.5 ${st === k ? "bg-action-fill text-white" : "bg-surface text-ink-2"}`}>{l}</button>)}</div>
        <span role="status" className="text-xs text-ink-2">{state === "copied" && <span className="sr-only">Citation copied to clipboard</span>}{state === "manual" && "Select the text and press Ctrl+C."}</span></div>
      <p className="mt-1 select-text whitespace-pre-line text-sm leading-normal text-ink-2 [overflow-wrap:anywhere]">{citeStyle(a, st).map((p, i) => p.i ? <i key={i}>{p.t}</i> : p.t)}</p>
    </section>);
}
function Overview({ a, mode, setMode }) {
  const [k, setK] = useState("half"), [, setHalf] = useState(0);
  useEffect(() => { setMode("abstract"); setK("half"); }, [a.id]);
  useEffect(() => { if (mode === "summary") window.__S.half().then(() => setHalf((n) => n + 1)); }, [mode, a.id]); // R256: half.json only once the AI summary is shown
  const seg = (on) => `min-h-10 px-3 ${on ? "bg-action-fill text-white" : "bg-surface text-ink-2"}`;
  const text = mode === "abstract" ? a.abstract || "No abstract in the record. Open the item in the UPOU Repository." : a[k] || "";
  return (
    <section className="mt-6">
      <Cite a={a} />
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-2"><h2 className="mr-auto font-serif text-2xl">{mode === "abstract" ? "Abstract" : "Summary"}</h2>
        <div role="group" aria-label="Show" className="flex overflow-hidden rounded-md border border-line text-sm">{[["abstract", "Abstract"], ["summary", "AI summary"]].map(([x, l]) => <button key={x} type="button" aria-pressed={mode === x} onClick={() => setMode(x)} className={seg(mode === x)}>{l}</button>)}</div>
        {mode === "summary" && <div role="group" aria-label="Summary length" className="flex overflow-hidden rounded-md border border-line text-sm">{LENS.map(([x, l]) => <button key={x} type="button" aria-pressed={k === x} onClick={() => setK(x)} className={seg(k === x)}>{l}</button>)}</div>}</div>
      {mode === "summary" && <p role="note" className="mt-3 rounded-md bg-crimson-soft px-3 py-2 text-sm text-ink-2"><b>AI-generated.</b> These summaries were written by a language model from the full text and may contain errors; check the original article.</p>}
      {mode === "summary" && <NoCite className="mt-2" />}<EmphKey />
      <div className={`mt-4 space-y-4 text-lg leading-8 text-ink mx-auto max-w-prose rounded-lg border border-line bg-surface px-5 py-6 shadow-sm sm:px-10 sm:py-8 text-justify hyphens-auto [text-wrap:pretty]"`}>{text.split(/\n+/).map((p, i) => <p key={i}><Emph text={p} terms={[...(a.subjects || []), ...(a.autoTags || []), ...(a.subtopics || [])]} /></p>)}</div>
      {a.diff && <div className="mt-8"><h2 className="border-b border-line pb-2 font-serif text-2xl">What sets this work apart<AiLabel /></h2>
        <NoCite what="AI comparison" className="mt-3" />
        <EmphKey /><div className="mx-auto mt-4 max-w-prose space-y-4 rounded-lg border border-line bg-surface px-5 py-6 text-lg leading-8 text-ink shadow-sm hyphens-auto text-justify [text-wrap:pretty] sm:px-10 sm:py-8">{a.diff.map((p, i) => <p key={i}><Emph text={p} terms={[...(a.subjects || []), ...(a.autoTags || []), ...(a.subtopics || [])]} /></p>)}</div></div>}
    </section>
  );
}
// Reader toolbar: sticky jump links to the page's sections, reading progress, previous/next in the collection, share.
const SIZES = [1, 1.15, 1.3];
function ReaderBar({ a, z, setZ, openFaq }) {
  const [pct, setPct] = useState(0), [msg, setMsg] = useState("");
  useEffect(() => { const f = () => { const h = document.documentElement.scrollHeight - innerHeight; setPct(h > 0 ? Math.round(Math.min(1, scrollY / h) * 100) : 100); }; f(); addEventListener("scroll", f, { passive: true }); addEventListener("resize", f); return () => { removeEventListener("scroll", f); removeEventListener("resize", f); }; }, [a.id]);
  const its = window.__S.articles.filter((b) => colKey(b) === colKey(a)), i = its.indexOf(a), prev = its[i - 1], next = its[i + 1];
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const share = async () => { const url = location.href; try { if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: a.title, url }); return; } await navigator.clipboard.writeText(url); setMsg("Link copied"); } catch (e) { if (e?.name !== "AbortError") setMsg("Copy the address bar to share"); } setTimeout(() => setMsg(""), 2500); };
  const btn = "min-h-10 rounded-full px-3 text-sm text-link hover:bg-navy-soft";
  return (
    <nav aria-label="On this page" className="sticky top-0 z-20 -mx-4 mt-3 border-b border-line bg-paper/95 px-4 py-1 backdrop-blur print:hidden">
      <div className="flex flex-wrap items-center gap-x-1">
        <button type="button" className={btn} onClick={() => jump("r-overview")}>Abstract</button>
        {!a.noFaq && <button type="button" className={btn} onClick={() => { openFaq(); jump("r-faq"); }}>Questions</button>}
        <button type="button" className={btn} onClick={() => jump("r-related")}>Related</button>
        <span className="ml-auto flex flex-wrap items-center gap-x-1">
          {prev && <Link to={"/read/" + prev.id} title={prev.title} className={btn + " inline-flex items-center"}>‹ Previous in collection</Link>}
          {next && <Link to={"/read/" + next.id} title={next.title} className={btn + " inline-flex items-center"}>Next in collection ›</Link>}
          <button type="button" onClick={share} className={btn}>Share link</button>
          <button type="button" onClick={() => print()} className={btn}>Print</button>
          <span role="group" aria-label="Text size" className="inline-flex">{[[-1, "A−", "Smaller text"], [1, "A+", "Larger text"]].map(([d, l, t]) => <button key={d} type="button" aria-label={t} title={t} disabled={!SIZES[z + d]} onClick={() => { setZ(z + d); pref.set("upou-text", String(z + d)); }} className={btn + " disabled:opacity-40"}>{l}</button>)}</span>
          <span role="status" className="text-xs text-ink-2">{msg}</span></span>
      </div>
      <div role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1 overflow-hidden rounded bg-line"><div className="h-full bg-action-2-fill" style={{ width: pct + "%" }} /></div>
    </nav>
  );
}
// The passage a search result pointed at (route /read/ID/p/PAGE/TERMS), highlighted and scrolled into view.
function AtPassage({ a, at }) {
  const [p, setP] = useState(undefined), ref = useRef(null);
  useEffect(() => { let live = true; pagePassage(a.id, at[0], at[1]).then((x) => live && setP(x), () => live && setP(null)); return () => { live = false; }; }, [a.id, at[0], at[1]]);
  useEffect(() => { if (p) { ref.current?.scrollIntoView({ block: "center" }); ref.current?.focus({ preventScroll: true }); } }, [p]);
  if (p === undefined) return null;
  return <section ref={ref} tabIndex={-1} id="r-passage" aria-label="Passage from your search" className="mt-6 scroll-mt-16 rounded-xl border-l-4 border-action-2 bg-sky/20 px-4 py-3">
    <h2 className="text-2xs font-bold uppercase tracking-wide text-ink-3">From your search · PDF page {at[0]}</h2>
    {p ? <p className="mt-1 text-lg leading-8 text-ink">{hl(p.text, p.terms)}</p> : <p className="mt-1 text-sm text-ink-2">That passage could not be loaded; open the original article and go to page {at[0]}.</p>}</section>;
}
// "Copy link" beside a reader section heading: #/read/ID/s/<section> opens the item at that section
function SecLink({ id, sec }) {
  const [msg, setMsg] = useState(""), say = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2000); };
  return <><button type="button" onClick={() => navigator.clipboard.writeText(location.href.split("#")[0] + `#/read/${id}/s/${sec}`).then(() => say("Link copied"), () => say("Copy is blocked here: use the address bar"))} aria-label="Copy link to this section" title="Copy link to this section" className="min-h-10 min-w-10 rounded-full px-2 text-sm font-normal text-link hover:bg-navy-soft print:hidden">{msg === "Link copied" ? "Copied" : "#"}</button><span role="status" className="sr-only">{msg}</span></>;
}
// Honest full-text state: the PDF stays in the UPOU Repository; we only link out.
function SpringerItem({ id }) {
  const S = window.__S, [d, setD] = useState(null);
  useEffect(() => { let on = true; (S.springI ||= fetch(import.meta.env.BASE_URL + "index/springer-items.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))).then((m) => on && setD(m[id] || null)); return () => { on = false; }; }, [id]);
  return d ? <p className="mt-1 text-xs text-ink-3">Also published by Springer: <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-link underline">doi.org/{d.doi}</a> (matched automatically).</p> : null;
}
function Access({ a }) {
  const link = repoUrl(a.url) && <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium text-link underline">the UPOU Repository</a>;
  return (
    <section aria-label="Full text" className="mt-6 max-w-2xl rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
      <h2 className="text-2xs font-bold uppercase tracking-wide text-ink-3">Full text</h2>
      {a.restricted ? <p className="mt-1"><b>Full text restricted:</b> request it from {link}.</p>
        : !a.hasPdf ? <p className="mt-1"><b>No full text available</b> for this item. Only its record (title, authors, abstract) is shown here; check {link} for updates.</p>
        : <p className="mt-1">The full text is held by {link}; this site links to it and does not serve the file.</p>}
      {a.scanned && !a.ocr && a.hasPdf && !a.restricted && <p className="mt-1 text-xs text-ink-3">This PDF is a scan with no text layer, so search here covers its title, abstract and topics only; open it in the repository to read it.</p>}
      {a.dupOf && <p className="mt-1 text-xs text-ink-3">This record duplicates <Link to={"/read/" + a.dupOf} className="text-link underline">item {a.dupOf}</Link> in the repository.</p>}
      {a.ocr && a.hasPdf && !a.restricted && <p className="mt-1 text-xs text-ink-3">Text recognised by OCR from a scan; search matches and summaries may contain errors.</p>}
      <SpringerItem id={a.id} />
    </section>);
}
function Reader({ id, at, sec }) {
  const [z, setZ] = useState(() => Math.min(2, Math.max(0, +pref.get("upou-text") || 0)));
  const [mode, setMode] = useState("abstract"); // lifted: the Q&A no-cite note follows the Abstract/AI-summary toggle
  const [fq, setFq] = useState(sec === "faq"), a = window.__S.byId[id], faqs = useFaqs(fq ? a?.id : null); // hook before the early return; R257: FAQs load when expanded
  useEffect(() => { if (sec === "faq") setFq(true); if (sec) document.getElementById("r-" + sec)?.scrollIntoView(); }, [sec, faqs?.length]);
  const [from] = useState(() => { const r = trail.at(-1).route; return /^\/search\/[^/]+/.test(r) ? r : null; }); // R295: read before useHash pushes this route, so the last entry is where we came from
  if (!a) return <p>We couldn’t find that item; it may have moved. <Link to="/search" className="text-link underline">Search the repository</Link> or <Link to="/" className="text-link underline">browse the collections</Link>.</p>;
  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        {from && <Link to={from} data-back-results className="mb-2 inline-flex min-h-10 items-center text-sm font-medium text-link hover:underline print:hidden">← Back to results for “{clip(dec(from.split("/")[2]), 40)}”</Link>}
        <Crumbs trail={[["/", "Home"], ["/collections", "Collections"], ["/faculty/" + slug(a.faculty), a.faculty], ["/collection/" + colKey(a), a.collection], [null, clip(a.title, 50)]]} />
        <div className="rise mt-3 flex gap-5"><div className="hidden w-36 shrink-0 sm:block"><Cover a={a} small /></div><div>
        <Link to={"/type/" + slug(a.type)} className="mr-2 inline-block rounded-full bg-action-fill px-3 py-0.5 text-xs font-bold text-white hover:underline">{a.type}</Link>{a.faculty && <Link to={"/faculty/" + slug(a.faculty)} className="mr-2 inline-block rounded-full bg-navy-soft px-3 py-0.5 text-xs font-medium text-navy hover:underline">{a.faculty}</Link>}
        {a.categories?.map((c) => <Link key={c} to={"/cat/" + slug(c)} className="mr-2 inline-block rounded-full bg-crimson-soft px-3 py-0.5 text-xs font-medium text-link hover:underline">{c}</Link>)}
        <h1 className="mt-2 font-serif text-3xl leading-tight">{a.title}</h1>
        <div className="mt-2 text-ink-3">{by(a)} · {a.year} · <Link to={"/collection/" + colKey(a)} className="text-link underline">{a.collection}</Link>{pagesOf(a)}</div>
        <Advisers_ a={a} />
        <ItemTags a={a} /></div></div>
        <ReaderBar a={a} z={z} setZ={setZ} openFaq={() => setFq(true)} /><div style={{ zoom: SIZES[z] }}>
        {at && <AtPassage a={a} at={at} />}
        <div id="r-overview" className="scroll-mt-16"><Overview a={a} mode={mode} setMode={setMode} /></div>
        <Access a={a} />
        <div className="mt-6 flex flex-wrap items-center gap-3 print:hidden"><AddBtn id={a.id} label className="!bg-navy-soft" /><Link to={"/maps/pub/" + a.id} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-medium text-link hover:bg-navy-soft">Relationship map</Link>{(() => { const l = (getLists().find((x) => x.items.includes(a.id)) || { items: [] }).items, nx = l[l.indexOf(a.id) + 1]; return nx && window.__S.byId[nx] ? <Link to={"/read/" + nx} className="rounded-full border border-line px-4 py-2 text-sm font-medium text-link hover:bg-navy-soft">Next in my list →</Link> : null; })()}{repoUrl(a.url) && <a href={a.url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-action-fill px-5 py-2.5 text-sm font-medium text-white hover:bg-action-2-fill">Open in the UPOU Repository ↗</a>}{doiUrl(a.doi) ? <a href={doiUrl(a.doi)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-link hover:bg-navy-soft">DOI {a.doi} ↗</a> : a.doi && <span className="px-2 text-sm text-ink-3">DOI {a.doi}</span>}</div>
        <section id="r-faq" className="mt-10 scroll-mt-16"><h2 className="flex items-center gap-2 font-serif text-2xl">Questions this item answers <span className="rounded bg-crimson-soft px-1.5 py-px text-xs font-bold text-link" title="Generated by a language model; check the original article">AI</span><SecLink id={a.id} sec="faq" /></h2>
          <details open={fq} onToggle={(e) => setFq(e.currentTarget.open)} className="mt-2"><summary className="inline-flex min-h-10 cursor-pointer items-center text-sm font-medium text-link">Questions answered by this item</summary>
          {mode === "summary" && <NoCite what="AI-generated questions and answers" className="mt-3" />}<EmphKey />
          {faqs === null ? <p role="status" className="mt-2 text-sm text-ink-3">Loading…</p> : !faqs.length && <p className="mt-2 text-sm text-ink-3">No AI-generated questions for this item yet.</p>}
          {faqs?.length > 0 && [["key", "Key questions"], ["topic", "By topic"]].map(([k, h]) => { const g = faqs.filter((f) => (f.kind || "key") === k); return g.length > 0 && <div key={k} data-faq-group={k}><h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-ink-3">{h}</h3>
          <div className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">{g.map((f) => <details key={f.id} className="group p-4"><summary className="cursor-pointer font-medium">{f.about && <span className="mr-2 rounded-full bg-navy-soft px-2 py-0.5 text-xs font-normal text-ink-2">{f.about}</span>}{f.q}</summary><p className="mt-2 text-justify hyphens-auto text-ink-2 [text-wrap:pretty]"><Emph text={f.a} terms={[...(a.subjects || []), ...(a.autoTags || []), ...(a.subtopics || [])]} /> <AiLabel /></p><Ref f={f} /></details>)}</div></div>; })}</details></section>
      </div></div>
      <aside id="r-related" className="scroll-mt-16"><h2 className="flex items-center gap-2 font-serif text-2xl">Related reading<SecLink id={a.id} sec="related" /></h2>
        <ul className="mt-3 space-y-3">{(a.related || []).map((r) => { const o = window.__S.byId[r.id]; return o && <li key={r.id} className="rounded-xl border border-line bg-surface p-4"><Link to={"/read/" + o.id} className="font-medium text-link hover:underline">{o.title}</Link><div className="mt-1 flex items-center gap-2"><div className="min-w-0 flex-1 text-xs text-ink-3">{by(o)} · {o.year}</div><AddBtn id={o.id} label /></div>{r.why && <p className="mt-2 text-justify text-sm text-ink-2 hyphens-auto [text-wrap:pretty]"><Emph text={r.why} terms={[...(o.subjects || []), ...(o.autoTags || []), ...(o.subtopics || [])]} /></p>}</li>; })}</ul></aside>
    </article>
  );
}

// One error boundary per route: a crash shows a message with Retry instead of a blank page; a new route starts clean.
class Boundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return <div role="alert" className="mx-auto max-w-xl p-8 text-center"><h1 className="font-serif text-2xl">Something went wrong on this page</h1><p className="mt-2 text-ink-2">{navigator.onLine ? "Try again, or go back to the catalogue." : "You seem to be offline. Reconnect and try again."}</p>
      <div className="mt-4 flex justify-center gap-3"><button type="button" onClick={() => this.setState({ err: null })} className="min-h-11 rounded-full bg-action-fill px-5 font-bold text-white hover:bg-action-2-fill">Retry</button><Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-link">Home</Link></div></div>;
  }
}
const useOnline = () => { const [on, set] = useState(navigator.onLine); useEffect(() => { const f = () => set(navigator.onLine); addEventListener("online", f); addEventListener("offline", f); return () => { removeEventListener("online", f); removeEventListener("offline", f); }; }, []); return on; };
const ROUTES = ["privacy", "about", "read", "list", "collections", "topics", "advisers", "adviser", "advanced", "maps", "search", "cat", "sub", "year", "collection", "tag", "faculty", "type"];
const lev = (a, b) => { let d = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } } return d[b.length]; };
function NotFound({ route }) {
  const seg = dec(route).split("/")[1]?.toLowerCase().slice(0, 30) || "", near = seg && ["collections", "topics", "advanced", "maps", "advisers", "privacy", "about"].find((r) => lev(seg, r) <= 2);
  const [q, setQ] = useState(() => dec(route.replace(/%(?![0-9a-f]{2})/gi, "")).replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 60));
  return (
    <section className="mx-auto max-w-3xl px-4 py-10 min-h-[85vh]">
      <h1 className="font-serif text-3xl">Page not found</h1>
      <p className="mt-2 text-ink-2">There is no page at “{route.slice(0, 80)}”. {near && <>Did you mean <Link to={"/" + near} data-didyoumean className="text-link underline">/{near}</Link>? </>}Search the repository instead, or open one of these:</p>
      <SearchBox value={q} onChange={setQ} placeholder="Search titles, authors, abstracts, topics…" className="mt-4" />
      <p className="mt-4 flex flex-wrap gap-3 text-sm">{[["/", "Home"], ["/collections", "Collections"], ["/topics", "Topics"], ["/advanced", "Advanced search"], ["/maps", "Maps"]].map(([to, l]) => <Link key={to} to={to} className="rounded-full bg-navy-soft px-3 py-1 text-navy hover:underline">{l}</Link>)}</p>
    </section>
  );
}
// Single-key shortcuts only fire when no field is focused and no modifier is held.
function onKeys(e, openHelp) {
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.key === "/") { const i = document.querySelector("input[role=combobox]"); if (i) { e.preventDefault(); i.focus(); } }
  else if (e.key === "?") openHelp();
  else if (e.key === "j" || e.key === "k") {
    const links = [...document.querySelectorAll('main li a[href^="#/read/"]')].filter((a, i, all) => all.findIndex((b) => b.closest("li") === a.closest("li")) === i && a.offsetParent);
    const at = links.findIndex((a) => a.closest("li") === document.activeElement?.closest("li")), to = links[e.key === "j" ? at + 1 : at < 0 ? -1 : at - 1];
    if (to) { to.focus(); to.scrollIntoView({ block: "center" }); }
  }
}
// Loading placeholder for /collections with the loaded page's frame and card grid, so the cards do not jump when data arrives.
// shortcut: only the card image box matches (the title area below varies with the title length), refine if the text area ever shifts.
const SkelCols = () => <div className="mx-auto max-w-5xl px-4 py-8" role="status" aria-label="Loading the repository index"><div className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 py-8 sm:px-8">
  <div className="skeleton h-9 w-48" /><div className="skeleton mt-1 h-6 w-2/3" />
  <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]"><div className="skeleton hidden h-64 lg:block" /><div><div className="skeleton mt-8 h-8 w-1/3" />
    <ul className="mt-[19px] grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(12rem, calc(50% - .625rem)), 1fr))" }}>{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <li key={i} data-skel-card><div className="skeleton m-px aspect-[3/2]" /><div className="skeleton mt-3 h-12" /></li>)}</ul></div></div></div></div>;
const LegalFallback = <div className="skeleton h-64" role="status" aria-label="Loading" />;
export default function App() {
  const [help, setHelp] = useState(false);
  useEffect(() => { const f = (e) => onKeys(e, () => setHelp((h) => !h)); addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, []);
  const route = useHash(), [state, setState] = useState("loading");
  const [, setFaqTick] = useState(0);
  useEffect(() => { load().then((S) => { window.__S = S; setState("ok"); S.textsP.then(() => { if (!/^#?\/?$/.test(location.hash)) setFaqTick((n) => n + 1); }); /* home shows nothing from texts.json: skip the re-render there (round 47) */ }).catch((e) => setState("Could not load the index: " + e.message)); }, []);
  const consent = useConsent(), online = useOnline(), [upd, setUpd] = useState(null);
  useEffect(() => { if (consent) syncSW(); }, [consent?.prefs]); // undecided (first visit or a choice over 12 months old, R278): keep any offline copy until the visitor chooses
  useEffect(() => { const f = (e) => setUpd(() => e.detail), k = (e) => e.key === "Escape" && setUpd(null); addEventListener("upou-update", f); addEventListener("keydown", k); return () => { removeEventListener("upou-update", f); removeEventListener("keydown", k); }; }, []); // R294: Esc dismisses the update bar
  // the semantic model is a third-party download: only with consent, and only once someone searches (box focus or a search route)
  useEffect(() => { if (state === "ok" && consent?.model && /^\/search[/?]/.test(route)) startModel(true); }, [state, consent?.model, route]);
  const qi = route.indexOf("?"), parts = (qi < 0 ? route : route.slice(0, qi)).split("/").filter(Boolean);
  const entry = qi < 0 ? null : urlEntry(route.slice(qi + 1)); // #/search?query=… and #/advanced?query=… (the Topic Planner's URLs)
  const art = state === "ok" && parts[0] === "read" ? window.__S.byId[parts[1]] : null;
  const PAGE = { search: "Search", advanced: "Advanced search", maps: "Maps", privacy: "Privacy notice", about: "About", collections: "Collections", topics: "Topics", advisers: "Advisers by topic", list: "View lists" };
  const seoT = art ? art.title : PAGE[parts[0]] ? (parts[0] === "search" && (parts[1] || entry?.q) ? `Search: ${(parts[1] ? parts[1].replace(/%[0-9a-f]{2}/gi, dec) : qclean(entry.q)).slice(0, 80)}` : PAGE[parts[0]]) : "";
  useSeo(seoT ? seoT + " | UPOU Repository concept" : "UPOU Repository concept: theses, papers, articles and presentations", art ? (art.abstract || art.half || "").replace(/\s+/g, " ").slice(0, 155) : "Search and browse theses, student papers, scholarly articles and presentations from UP Open University by faculty, collection, type and adviser. Every record links to the official UPOU Repository.");
  // R205: a page change moves focus to its h1 (not on first load, not while typing in a search, not when focus is already inside the page)
  const pageKey = state === "ok" ? parts.slice(0, parts[0] === "search" ? 1 : 2).join("/") : "", seen = useRef(null);
  useEffect(() => {
    if (!pageKey) return; if (seen.current === null) { seen.current = pageKey; return; } if (seen.current === pageKey) return; seen.current = pageKey;
    const m = document.getElementById("main"), f = document.activeElement;
    if (!m || (f && f !== m && m.contains(f))) return;
    const go = () => { const h = m.querySelector("h1"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } return !!h; };
    if (go()) return; // lazy pages (Legal) render their h1 after this effect: wait for it
    const mo = new MutationObserver(() => { const a = document.activeElement; if (a && a !== m && m.contains(a)) return mo.disconnect(); go() && mo.disconnect(); }), t = setTimeout(() => mo.disconnect(), 3000); // the lazy login autofocuses its username: keep that
    mo.observe(m, { childList: true, subtree: true }); return () => { mo.disconnect(); clearTimeout(t); };
  }, [pageKey]);
  return (
    <>
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }} className="skip">Skip to content</a>
      <Header route={route} />
      {upd && <p role="status" className="bg-navy-soft px-4 py-2 text-center text-sm text-navy print:hidden">A new version of the site is ready. <button type="button" onClick={() => applyUpdate(upd)} className="ml-2 min-h-9 rounded-full bg-action-fill px-3 font-medium text-white">Reload</button></p>}
      {!online && <p role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 print:hidden">You are offline. Pages already opened still work; new search data or items may not load until you reconnect.</p>}
      <main id="main" tabIndex={-1} className={parts[0] === undefined || state !== "ok" ? "min-h-[60vh]" : ["search", "advanced", "maps"].includes(parts[0]) ? "mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 py-8 sm:px-8" : "mx-auto max-w-5xl px-4 py-8"}>
        {state === "loading" && parts[0] === "collections" ? <SkelCols /> : state === "loading" ? <div className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] p-8" role="status" aria-label="Loading the repository index"><div className="skeleton h-64" /><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton aspect-[3/4]" />)}</div></div> : state !== "ok" ? <div className="p-8" role="alert"><p>{state}</p>{!online && <p className="mt-1 text-ink-2">You are offline.</p>}<button type="button" onClick={() => location.reload()} className="mt-3 min-h-11 rounded-full bg-action-fill px-5 text-white">Retry</button></div> :
          <Boundary key={route}>{parts[0] && !ROUTES.includes(parts[0]) ? <NotFound route={route} /> : parts[0] === "privacy" ? <Suspense fallback={LegalFallback}><Privacy /></Suspense> : parts[0] === "about" ? <Suspense fallback={LegalFallback}><About /></Suspense> : parts[0] === "read" ? <Reader id={parts[1]} at={parts[2] === "p" && /^\d+$/.test(parts[3] || "") ? [parts[3], dec(parts[4] || "")] : null} sec={parts[2] === "s" && /^(overview|faq|related)$/.test(parts[3] || "") ? parts[3] : null} /> : parts[0] === "list" ? <Suspense fallback={LegalFallback}>{parts[1] === "share" ? <SharedList name={parts[2]} ids={parts[3]} /> : <MyList lid={parts[1]} />}</Suspense> : parts[0] === "collections" ? <Collections pre={parts[1]} /> : parts[0] === "topics" ? <Topics /> : parts[0] === "advisers" ? <Gate><Suspense fallback={AdvFallback}><Advisers /></Suspense></Gate> : parts[0] === "adviser" ? <Gate><Suspense fallback={AdvFallback}><AdviserPage id={dec(parts[1] || "")} /></Suspense></Gate> : parts[0] === "advanced" ? <Suspense fallback={<><h1 className="font-serif text-3xl">Advanced search</h1><AdvIntro /><div className="skeleton mt-4 h-[85vh]" role="status" aria-label="Loading" /></>}><Advanced share={parts[1] === "s" ? parts[2] : null} entry={entry?.q ? { ...entry, q: qclean(entry.q) } : null} /></Suspense> : parts[0] === "maps" ? <Suspense fallback={<><h1 className="font-serif text-3xl">Relationship map</h1><MapsIntro /><div className="skeleton mt-4 h-[85vh]" role="status" aria-label="Loading" /></>}><Gate on={parts[1] === "adviser"}><Maps kind={parts[1]} id={parts[2] && dec(parts[2])} /></Gate></Suspense> : parts[0] === "search" ? <Search q0={parts[1] ? qclean(dec(parts[1])) : qclean(entry?.q || "")} y0={entry} /> :
          ["cat", "sub", "year", "collection", "faculty", "type", "tag"].includes(parts[0]) ? <Group key={route} kind={parts[0]} id={parts[1]} pre={parts[2]} /> : <Browse />}</Boundary>}
      </main>
      <footer className="mt-10 bg-ink-fill text-sm text-white/80 print:hidden">
        <div className="mx-auto grid max-w-6xl min-[1536px]:max-w-[88rem] gap-8 px-4 py-8 sm:px-8 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-lg text-white">UPOU Repository concept</h2>
            <p className="mt-3">A search and browse layer over the records of the UP Open University repository. Full texts stay with the repository; every item links back to it.</p>
            <p className="mt-3">Record metadata © its authors and UPOU; check each item’s licence in the repository.</p>
          </div>
          <div>
            <h2 className="font-serif text-lg text-white">Official site</h2>
            <address className="mt-3 not-italic leading-relaxed">UP Open University<br />Los Baños, Laguna, Philippines 4031<br /><a href="https://repository.upou.edu.ph" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">repository.upou.edu.ph</a></address>
          </div>
        </div>
        <p className="border-t border-white/15 px-4 pt-4 text-center text-xs text-white/80"><a href="mailto:roque.almodiel@gmail.com?subject=A%20similar%20site%20for%20our%20repository" className="inline-flex min-h-11 items-center gap-2 underline hover:text-white"><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>Want a similar site for your repository, public or intranet? Email the developer.</a></p>
        <p className="px-4 pb-4 pt-1 text-center text-xs text-white/65">Proof of concept, not an official UPOU site. Summaries, questions and answers, and related-reading notes are AI-generated, so check the original record. · <a href="#/about" className="underline hover:text-white">About</a> · <a href="#/privacy" className="underline hover:text-white">Privacy</a> · <button type="button" onClick={() => setHelp(true)} className="underline hover:text-white">Keyboard shortcuts</button> · <button type="button" onClick={openCookieSettings} className="underline hover:text-white">Cookie settings</button></p>
      </footer>
      {help && <Suspense fallback={null}><KeyHelp onClose={() => setHelp(false)} /></Suspense>}
      <CookieConsent />
      <IconDefs />
    </>
  );
}
