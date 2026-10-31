// The ONE door to adviser data: people index, meaning vectors, IJODeL list, international flags, per-person writeups and IJODeL summaries.
// Nothing outside this file fetches those files. Production: every file is AES-GCM ciphertext (index/a/<hmac>.enc) opened with the in-memory key from access.js
// after login; dev server: plaintext. All GET, no body. Lock wipes everything cached here.
import { makeCtx, buildPeople } from "./advisers.js";
import { adv, onLock, bump } from "./access.js";
const once = (S, k, f) => (S[k] ||= f());
onLock(() => { const S = window.__S; if (!S) return; for (const k of ["peopleP", "vecP", "profP", "springP", "ppl", "pvecs", "advN", "advTopics", "expVec", "pplErr"]) delete S[k]; for (const a of [...(S.articles || []), ...Object.values(S.byId || {})]) if (a.advisers?.length) a.advisers = []; });

export function loadPeople() {
  const S = window.__S;
  return once(S, "peopleP", () => Promise.all([adv("people.json"), adv("ijodel-articles.json", []), adv("international.json", {}), adv("advmap.json", {})]).then(([raw, ij, intl, amap]) => {
    if (!raw) throw new Error("no people data");
    for (const a of [...S.articles, ...Object.values(S.byId)]) if (amap[a.id]) a.advisers = amap[a.id]; // production keeps adviser names out of the public articles.json
    delete S.advN;
    const ctx = makeCtx(S.articles); ij = ij.map((a) => ({ ...a, year: +a.year || 0, subjects: a.subjects || [], categories: a.categories || [] }));
    S.ppl = { ctx, ...buildPeople(raw, S.articles, ctx.lastYear, { ij, intl: intl.items || {} }) };
    bump(); return S.ppl;
  })).catch((e) => { delete S.peopleP; throw e; });
}
// people.bin: int8 mean vectors, only after the opt-in model is ready
export function loadVecs() {
  const S = window.__S;
  return once(S, "vecP", () => adv("people.bin", null, true).then((b) => (S.pvecs = b && new Int8Array(b))));
}
// per-person AI writeups {half, one, two} (profiles/<slug>.json) or null when not generated yet
export function loadProfile(slug) {
  const S = window.__S, c = (S.profP ||= new Map());
  if (!c.has(slug)) c.set(slug, adv("profiles/" + slug + ".json", null).then((j) => { if (j && typeof j === "object") return j; c.delete(slug); return null; })); // adv() turns a network error into null: do not cache "none", so opening the writeup again retries
  return c.get(slug);
}
// AI half-page summaries of the person's IJODeL articles: {articleId: text}
export const loadIjSummaries = (slug) => adv("ijodel/" + slug + ".json", {});
// Springer works per person {slug: [{doi,url,title,year,container,type}]} (Crossref matches; a sample, not a full bibliography)
export const loadSpringer = () => { const S = window.__S; return once(S, "springP", () => adv("springer.json", {})); };
