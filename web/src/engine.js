// All-browser engine: field-weighted keyword scoring + bge-small vectors, FAQ matching, related lists.
import { weakDevice } from "./device.js";
// Field weights follow the brief: title > abstract > half-page > one-page > two-page summary.
export const FIELDS = [["title", 5], ["abstract", 3], ["half", 2], ["one", 1.5], ["two", 1]];
export const FIELD_LABEL = { author: "author", title: "title", abstract: "abstract", half: "content", one: "content", two: "content" };
const tok = (s) => (s || "").toLowerCase().match(/[a-z0-9]{2,}/g) || [];
const QP = "Represent this sentence for searching relevant passages: ";
const D = 384;
const LATE = ["one", "two"];
let S, embedder;

const index = (docs) => {
  const df = new Map(), rows = docs.map((t) => {
    const w = tok(t), tf = new Map();
    w.forEach((x) => tf.set(x, (tf.get(x) || 0) + 1));
    tf.forEach((_, x) => df.set(x, (df.get(x) || 0) + 1));
    return { tf, len: w.length };
  });
  return { df, rows, avg: rows.reduce((a, r) => a + r.len, 0) / rows.length || 1 };
};
const bm25 = ({ df, rows, avg }, qt) => rows.map(({ tf, len }) => qt.reduce((s, w) => {
  const f = tf.get(w); if (!f) return s;
  const n = df.get(w);
  return s + Math.log(1 + (rows.length - n + 0.5) / (n + 0.5)) * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * len / avg));
}, 0));
// shortcut: the worker file sits one folder below the site root (dist/assets/, dev src/); change if assetsDir gets nested
const ROOT = globalThis.WorkerGlobalScope ? new URL("../", self.location).href : import.meta.env?.BASE_URL ?? "/";
const j = (f) => fetch(ROOT + "index/" + f).then((r) => r.json());
const deq = (x) => (x.byteLength % 4 === 0 && x.byteLength / 4 === S.chunks.length * D ? Int8Array.from(new Float32Array(x), (v) => Math.round(v * 127)) : new Int8Array(x)); // vecs.bin is int8 since round 43 and stays int8 in memory (cos divides by 127); legacy float32 is quantised on read
const b = (f) => fetch(ROOT + "index/" + f).then((r) => r.arrayBuffer());

export async function load() {
  if (S) return S;
  const [articles, chunks] = await Promise.all([j("articles.json"), j("chunks.json").catch(() => [])]); // no chunks yet = keyword search over the records only
  for (const a of articles) { // the harvested JSON is loose (year as text, missing lists): one tidy shape for the whole app
    a.year = +a.year || 0; for (const k of ["authors", "subjects", "categories", "subtopics", "autoTags", "advisers", "related"]) a[k] = Array.isArray(a[k]) ? a[k] : [];
    a.type ||= "Other"; a.faculty ||= ""; a.collection ||= ""; a.abstract ||= ""; a.hasPdf = !!a.hasPdf;
  }
  const byId = Object.assign(Object.create(null), Object.fromEntries(articles.map((a, i) => [a.id, { ...a, i }]))); // no prototype: /read/__proto__ is just unknown
  S = { articles, byId, chunks, chunkArt: chunks.map((id) => byId[id]?.i ?? -1) };
  S.artChunks = articles.map(() => []); S.chunkArt.forEach((a, c) => a >= 0 && S.artChunks[a].push(c));
  // the built site ships the 1-page and 2-page summaries apart (texts.json, ~0.9 MB raw); search and the Reader wait for them
  const whole = !articles.length || "one" in articles[0];
  S.textsP = whole ? Promise.resolve() : Promise.all([j("texts.json"), j("why.json").catch(() => ({}))]).then(([t, w]) => {
    for (const a of articles) { const x = { ...t[a.id] }; Object.assign(a, x); Object.assign(byId[a.id], x); for (const r of byId[a.id].related || []) r.why = w[a.id]?.[r.id]; }
    vocab = undefined; // rebuilt with the full abstracts
  }).catch(() => {}); // keyword search then runs without the late fields
  // R256: the half-page summaries (half.json, ~1.3 MB) load on the first search or when the Reader shows the AI summary; a failed load is retried next time
  S.half = () => (S.halfP ||= whole ? Promise.resolve() : j("half.json").then((h) => { for (const a of articles) a.half = byId[a.id].half = h[a.id] || ""; }, () => { S.halfP = null; }));
  return S;
}

// Per-article files written by seo.mjs (index/pass/<id>.json, index/faq/<id>.json), fetched on demand and kept in a small LRU.
// Dev server and node (search-eval) have only the whole files: the fallback loads those once and keeps them.
const lru = (max) => { const m = new Map(); return (k, f) => { let v = m.get(k); if (v) m.delete(k); else v = f().catch((e) => { m.delete(k); throw e; }); m.set(k, v); if (m.size > max) m.delete(m.keys().next().value); return v; }; };
const passLru = lru(40), faqLru = lru(20);
// Round 38: the public build ships no PDF passages (copyright), so a miss means "none": results fall back to the abstract/summary the cards already show.
const passFor = (i) => passLru(i, async () => {
  const p = S.noPass ? [] : await j(`pass/${S.articles[i].id}.json`).catch(async () => { try { const all = await (S.passAll ||= j("passages.json")); return S.artChunks[i].map((c) => all[c]); } catch { S.noPass = 1; return []; } });
  return { p, low: p.map((x) => (x[1] || "").toLowerCase()) }; // lowercase once per article, not per query
});
export const faqsFor = (id) => faqLru(id, () => j(`faq/${id}.json`).catch(async () => (await (S.faqAll ||= j("faqs.json"))).filter((f) => f.article === id)));

// IndexedDB copy of vecs.bin, keyed by the server's validator (ETag / Last-Modified) and the expected size.
const idb = (mode, f) => new Promise((ok, no) => {
  const r = indexedDB.open("upou", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("kv");
  r.onsuccess = () => { const t = r.result.transaction("kv", mode), q = f(t.objectStore("kv")); t.oncomplete = () => { r.result.close(); ok(q.result); }; t.onerror = () => no(t.error); };
  r.onerror = () => no(r.error);
});
async function vecs(persist) {
  if (!persist || typeof indexedDB === "undefined") return deq(await b("vecs.bin"));
  const n = S.chunks.length * D, tag = await fetch(ROOT + "index/vecs.bin", { method: "HEAD" }).then((r) => r.headers.get("etag") || r.headers.get("last-modified") || "").catch(() => null);
  const hit = await idb("readonly", (st) => st.get("vecs")).catch(() => null);
  // shortcut: with no validator from the server (tag "") a same-size rebuild is not noticed; offline (tag null) uses the copy
  if (hit && [n, n * 4].includes(hit.buf.byteLength) && (tag === null || hit.tag === tag)) return deq(hit.buf);
  const v = await b("vecs.bin");
  await idb("readwrite", (st) => st.put({ tag: tag || "", buf: v }, "vecs")).catch(() => {});
  return deq(v);
}

// Loads the model (Cache Storage when persist) and the passage vectors; tell() gets {s: loading|ready|failed, pct}.
// A failure leaves keyword search (BM25) only; the next call tries again.
let readyP;
export function ready(persist = false, tell = () => {}) {
  return readyP ||= (async () => {
    tell({ s: "loading", pct: 0 });
    const { pipeline, env } = await import("@huggingface/transformers"); // ~800 KB, only when someone searches
    env.allowLocalModels = false; env.useBrowserCache = env.useWasmCache = persist && typeof caches !== "undefined";
    // ORT_SELF=1 builds copy the ONNX runtime next to the app (no jsDelivr); default: the version-pinned jsDelivr URL
    if (import.meta.env?.VITE_ORT) env.backends.onnx.wasm.wasmPaths = new URL(ROOT + import.meta.env.VITE_ORT, location.href).href;
    const got = {};
    const e = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8", device: globalThis.process?.versions?.node ? "cpu" : "wasm", progress_callback: (p) => {
      if (p.status !== "progress" || !p.total) return;
      got[p.file] = [p.loaded, p.total]; const v = Object.values(got);
      tell({ s: "loading", pct: Math.min(99, Math.round(100 * v.reduce((x, y) => x + y[0], 0) / v.reduce((x, y) => x + y[1], 0))) });
    } });
    S.cv ||= await vecs(persist);
    embedder = e; tell({ s: "ready", pct: 100 });
  })().catch((err) => { readyP = null; tell({ s: "failed", pct: 0 }); throw err; });
}
const qvec = async (q) => (await embedder(QP + q, { pooling: "cls", normalize: true })).data;
export const embed = async (q) => (embedder ? Array.from(await qvec(q)) : null); // /advisers: query vector for a topic, once the opt-in model is ready
const cos = (v, i, qv) => { let s = 0; for (let k = 0; k < D; k++) s += v[i * D + k] * qv[k]; return s / 127; };
const rrf = (lists, w = []) => {
  const m = new Map();
  lists.forEach((l, li) => l.forEach((id, p) => m.set(id, (m.get(id) || 0) + (w[li] ?? 1) / (5 + p))));
  return [...m.keys()].sort((x, y) => m.get(y) - m.get(x));
};
const top = (a, n = 50) => [...a.keys()].filter((i) => a[i] > 0).sort((x, y) => a[y] - a[x]).slice(0, n);

// The passage of an article that fits the query best: share of query words in it, plus vector similarity when known.
const QSTOP = new Set("a an the of to in on at by or and for with without within into from is are was be how what why when which who do does can about".split())
const STOPQ = new Set("the and for with that this from are was how what which into about their its can".split());
const bpCache = new Map(); // per query + article; cleared when the query changes
async function bestPassage(i, qt, qv) {
  const key = qt.join(" ") + "|" + !!qv; if (bpCache.q !== key) { bpCache.clear(); bpCache.q = key; }
  if (!bpCache.has(i)) bpCache.set(i, bestPassage0(i, qt, qv, await passFor(i)));
  return bpCache.get(i);
}
function bestPassage0(i, qt, qv, P) {
  const ws = [...new Set(qt.filter((w) => w.length > 2 && !STOPQ.has(w)))]; let best = null, bs = 0;
  for (const [k, c] of S.artChunks[i].entries()) {
    const [page, text] = P.p[k]; if (!text) continue;
    const low = P.low[k], kw = ws.length ? ws.filter((w) => low.includes(w)).length / ws.length : 0;
    const sc = kw + (qv ? Math.max(0, cos(S.cv, c, qv)) : 0);
    if (kw > 0 && sc > bs) {
      const at = Math.min(...ws.map((w) => low.indexOf(w)).filter((x) => x >= 0)), from = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 90)));
      bs = sc; best = { page, snip: (from ? "… " : "") + text.slice(from, from + 300).trim() + "…", terms: ws.join(" ") };
    }
  }
  return best;
}

// Articles ranked by field-weighted keywords fused with the best-matching passage vector.
export async function search0(q, { year, k = 20, fields } = {}) {
  await Promise.all([S.textsP, S.half()]);
  S.fieldIdx ||= Object.fromEntries(FIELDS.map(([f]) => [f, index(S.articles.map((a) => (f === "title" ? a.title + " " + a.authors.join(" ") : a[f] || "")))]));
  // the worker never shows texts: once indexed, its copies of the long summaries are dead weight (the main thread keeps its own for the Reader)
  if (globalThis.WorkerGlobalScope && !S.dropped) { S.dropped = 1; for (const a of [...S.articles, ...Object.values(S.byId)]) for (const f of ["half", "one", "two"]) delete a[f]; }
  // typo words also search as their did-you-mean fix ("chatgtp teaching": "teaching" alone matched, so the empty-result fallback never ran)
  const fix = didYouMean(q), qt = [...new Set([...tok(q), ...(fix ? tok(fix) : [])])].filter((w, _, all) => all.length < 4 || !QSTOP.has(w)), n = S.articles.length, total = new Array(n).fill(0), where = Array.from({ length: n }, () => []);
  for (const [f, w] of FIELDS) if (!fields || fields.includes(f)) bm25(S.fieldIdx[f], qt).forEach((s, i) => { if (s > 0) { total[i] += w * s; where[i].push(f); } });
  // Authors: any 3+ letter query word that is a substring of an author's name counts (first or last name).
  if (!fields || fields.includes("title")) {
    const ws = qt.filter((w) => w.length >= 3);
    S.articles.forEach((a, i) => { const au = a.authors.join(" ").toLowerCase(); const h = ws.filter((w) => au.includes(w)).length; if (h) { total[i] += 12 * h; where[i].unshift("author"); } });
  }
  const lists = [top(total)], weights = [1];
  let qv = null;
  if (embedder && (!fields || fields.length === FIELDS.length)) {
    qv = await qvec(q); const best = new Array(n).fill(-1);
    S.chunks.forEach((_, c) => { const a = S.chunkArt[c]; if (a >= 0) best[a] = Math.max(best[a], cos(S.cv, c, qv)); });
    lists.push([...best.keys()].sort((x, y) => best[y] - best[x]).slice(0, 50)); weights.push(0.35); // round 49/100: vector list weighs 0.35, RRF k 5 (R100; was 10) (was 1 and 60): hybrid hit@1 0.76 -> 0.86, hit@5 0.92 -> 0.94 on scripts/search-eval.mjs
  }
  const pass = !fields || fields.includes("half");
  return Promise.all(rrf(lists, weights).filter((i) => !year || S.articles[i].year === year).slice(0, k).map(async (i) => ({ i, matched: where[i], passage: pass ? await bestPassage(i, qt, qv).catch(() => null) : null })));
}

// "Did you mean": unknown query words are swapped for the commonest vocabulary word within 1-2 edits.
const lev = (a, b) => {
  let p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    for (let k = 1; k <= b.length; k++) c[k] = Math.min(p[k] + 1, c[k - 1] + 1, p[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
};
let vocab;
export function didYouMean(q) {
  if (!vocab) {
    vocab = new Map();
    S.articles.forEach((a) => tok(a.title + " " + a.subjects.join(" ") + " " + a.abstract).forEach((w) => vocab.set(w, (vocab.get(w) || 0) + 1)));
  }
  let changed = false;
  const out = tok(q).map((w) => {
    if (vocab.has(w) || w.length < 4) return w;
    const max = w.length > 6 ? 2 : 1;
    let best, bd = 9, bn = 0;
    for (const [x, n] of vocab) {
      if (Math.abs(x.length - w.length) > max) continue;
      const d = lev(w, x);
      if (d <= max && (d < bd || (d === bd && n > bn))) { best = x; bd = d; bn = n; }
    }
    if (best) changed = true;
    return best || w;
  });
  return changed ? out.join(" ") : null;
}

// Main thread: BM25, fusion, the model and "did you mean" run in a module worker (worker.js, its own copy of this file);
// if the worker cannot start or dies, the same functions run here. Node (search-eval) has no window and runs them here.
const ms = { s: "off", pct: 0 }, msubs = new Set();
export const modelState = () => ms;
export const onModel = (f) => { msubs.add(f); return () => msubs.delete(f); };
const tell = (m) => { Object.assign(ms, m); msubs.forEach((f) => f()); };
let W, seq = 0; const pend = new Map();
function worker() {
  if (W !== undefined) return W;
  W = null;
  if (typeof window === "undefined" || typeof Worker === "undefined" || window.__noWorker) return W;
  try {
    W = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    W.onmessage = ({ data: d }) => { if (d.m) return tell(d.m); const p = pend.get(d.id); pend.delete(d.id); if (p) d.e === undefined ? p[0](d.r) : p[1](new Error(d.e)); };
    W.onerror = (e) => { e.preventDefault?.(); W = null; pend.forEach((p) => p[1](new Error("worker"))); pend.clear(); };
  } catch { W = null; }
  return W;
}
// R266: a worker with no model and nothing pending ends after 60 s away from the search routes; worker() starts a fresh one on the next call
let idle; const arm = () => { clearTimeout(idle); idle = setTimeout(() => { if (!W) return; if (pend.size || ms.s === "loading" || ms.s === "ready" || /^#\/(search|advanced)/.test(location.hash)) return arm(); W.terminate(); W = undefined; }, 6e4); };
const call = (op, a) => new Promise((ok, no) => { pend.set(++seq, [ok, no]); W.postMessage({ id: seq, op, a }); arm(); });
const run = async (op, a, local) => (worker() ? call(op, a).catch((e) => (W ? Promise.reject(e) : local(...a))) : local(...a));
export async function searchArticles(q, opts) {
  const r = await run("search0", [q, opts], search0); await Promise.all([S.textsP, S.half()]);
  return r.map(({ i, ...x }) => ({ ...S.articles[i], ...x }));
}
export const embedQuery = (q) => run("embed", [q], embed);
export const didYouMeanAsync = (q) => run("didYouMean", [q], didYouMean);
export const warmSearch = () => { if (worker()) arm(); }; // on search-box focus: the worker parses its data before the first keystroke
export function startModel(persist) {
  if (ms.s === "loading" || ms.s === "ready") return;
  if (weakDevice()) return tell({ s: "failed", pct: 0 }); // low memory/slow link: stay on keyword search instead of a 34 MB download
  run("ready", [persist], (p) => ready(p, tell)).catch(() => {});
}
// Reader jump-to-passage: the chunk on that PDF page holding most of the query words (main thread, per-article file).
export async function pagePassage(id, page, terms) {
  const i = S?.byId[id]?.i; if (i == null) return null;
  const P = await passFor(i), ws = (terms || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let best = null, bs = -1;
  S.artChunks[i].forEach((c, k) => { const [pg, t] = P.p[k] || []; if (String(pg) !== String(page) || !t) return; const s = ws.filter((w) => P.low[k].includes(w)).length; if (s > bs) { bs = s; best = { page: pg, text: t, terms: ws.join(" ") }; } });
  return best;
}
