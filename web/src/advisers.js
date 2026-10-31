// Pure people/committee logic for /advisers (no DOM): run by ../adviser_check.py via scripts/advisers-eval.mjs on the real data and on fixtures.
// A person = an adviser (from the approval sheet) and/or the author of their own articles. Expertise = topics of the items they advised or wrote.
const STOP = new Set("the and for with from that this into using study based about their among between towards toward analysis impact effect effects use its are was were has have not can".split(" "));
export const tok = (s) => ((s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));
import { contrib, quality, recency, trackRaw, intlShare, chairScore, SRC } from "./scoring.js";
import { titled } from "./personName.js";
export const LEX_MIN_SEM = 0.7; // a person with no word match still "covers" a topic when the meaning score (0-1 over all people) is at least this

export function makeCtx(arts) {
  const df = new Map(), doc = new Map(); let minY = 9999, maxY = 0;
  for (const a of arts) {
    const t = new Set(tok([a.title, a.subjects.join(" "), a.subtopics.join(" "), a.categories.join(" "), a.abstract].join(" ")));
    doc.set(a.id, t); t.forEach((w) => df.set(w, (df.get(w) || 0) + 1));
    if (a.year) { minY = Math.min(minY, a.year); maxY = Math.max(maxY, a.year); }
  }
  return { n: arts.length, df, doc, minY, span: Math.max(1, maxY - minY), lastYear: maxY };
}
const idf = (c, w) => Math.log(1 + c.n / (c.df.get(w) || 1));
// topic: {k: "category"|"subtopic"|"tag"|"text", v}. Returns 0..1 (1 = the item has the tag, or holds every query word).
export function itemScore(c, a, t) {
  if (t.k === "category") return a.categories.includes(t.v) ? 1 : 0;
  if (t.k === "subtopic") return a.subtopics.includes(t.v) ? 1 : 0;
  if (t.k === "tag") return a.subjects.includes(t.v) ? 1 : 0;
  const q = t.q || (t.q = [...new Set(tok(t.v))].sort((x, y) => idf(c, y) - idf(c, x)).slice(0, 40)), d = c.doc.get(a.id);
  let hit = 0, all = 0; for (const w of q) { const i = idf(c, w); all += i; if (d.has(w)) hit += i; }
  return all ? hit / all : 0;
}
const rw = (c, a) => recency(a.year, c.minY, c.span); // recent items count a little more
// IJODeL articles are not in ctx.doc: tokens are cached on the article; structured topics match labels exactly, else by word share (>= 0.6)
export function ijScore(c, a, t) {
  if (t.k === "category" && a.categories.includes(t.v) || t.k === "subtopic" && a.subtopics?.includes(t.v) || t.k === "tag" && a.subjects.includes(t.v)) return 1;
  const d = a._t || (a._t = new Set(tok([a.title, a.subjects.join(" "), a.categories.join(" ")].join(" ")))), q = [...new Set(tok(t.v))];
  let hit = 0, all = 0; for (const w of q) { const i = idf(c, w); all += i; if (d.has(w)) hit += i; }
  const x = all ? hit / all : 0; return t.k === "text" || x >= 0.6 ? x : 0;
}
// BM25 of a topic against a person's expertise text, scaled to 0..1 by the best a document could do on the same query words (tf -> infinity).
const K1 = 1.2, B = 0.75;
export function expScore(c, p, t) {
  const d = p.expDoc; if (!d) return 0;
  if (t.k !== "text") return p.expT.some((x) => x.k === t.k && x.v === t.v) ? 1 : 0;
  const q = [...new Set(tok(t.v))]; let s = 0, all = 0;
  for (const w of q) { const i = idf(c, w), f = d.tf.get(w) || 0; all += i * (K1 + 1); if (f) s += i * f * (K1 + 1) / (f + K1 * (1 - B + B * d.len / d.avgdl)); }
  return all ? s / all : 0;
}
export function buildPeople(raw, arts, lastYear, { ij = [], intl = {} } = {}) {
  const byId = new Map(arts.map((a) => [a.id, a])), ijById = new Map(ij.map((a) => [a.id, a]));
  const list = raw.map((p, i) => {
    const adv = p.adv.map((id) => byId.get(id)).filter(Boolean).sort((x, y) => y.year - x.year);
    const aut = [...new Set([...p.aut, ...(p.own || []).map((w) => w.id).filter(Boolean)])].map((id) => byId.get(id)).filter(Boolean).sort((x, y) => y.year - x.year);
    const ija = (p.ij || []).map((id) => ijById.get(id)).filter(Boolean).sort((x, y) => y.year - x.year);
    const no = new Set((p.ni || []).map(String)), yes = new Set((p.ii || []).map(String)); // per-person overrides; "ij:N" addresses an IJODeL article
    const isIntl = (a) => !no.has(a.id) && (yes.has(a.id) || a.id in intl);
    const yrs = adv.map((a) => a.year).filter(Boolean), last = yrs.length ? Math.max(...yrs) : 0;
    return { i, name: p.n, slug: p.s, adv, aut, ij: ija.filter((a) => !no.has("ij:" + a.id)), intlIds: new Set(aut.filter(isIntl).map((a) => a.id)), first: yrs.length ? Math.min(...yrs) : 0, last,
      st: p.st || "", title: p.ti || "", unit: p.un || "", expertise: p.ex || [], expT: p.exT || [], former: p.fn || [], corrections: p.co || "", man: p.man || [], wr: p.wr || null, os: p.os || [], legal: p.legal || "", ijForced: p.ijf || [],
      none: adv.length === 0,                   // never advised in this repository
      inactive: adv.length > 0 && last < lastYear, // badge: latest advisee year is before the latest year with data in the whole dataset
      track: trackRaw(yrs, lastYear) };
  });
  list.forEach((p) => { p.expTok = p.expertise.length || p.expT.length ? tok([...p.expertise, ...p.expT.map((x) => x.v)].join(" ")) : null; }); // BM25 document: expertise text + keywords (new, split-off and item-less people)
  const ed = list.filter((p) => p.expTok), avgdl = ed.length ? ed.reduce((s, p) => s + p.expTok.length, 0) / ed.length : 1;
  list.forEach((p) => { p.expDoc = p.expTok && (p.st === "new" || !(p.adv.length + p.aut.length + p.ij.length)) ? { tf: p.expTok.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map()), len: p.expTok.length, avgdl } : null; });
  const mt = Math.max(1e-9, ...list.map((p) => p.track)); list.forEach((p) => { p.trackN = p.track / mt; });
  const bySlug = new Map(list.map((e) => [e.slug, e])); // old names and spellings keep working: /adviser/<old-slug> resolves to the merged person
  list.forEach((e) => (e.os || []).forEach((o) => bySlug.has(o) || bySlug.set(o, e)));
  return { lastYear, list, bySlug };
}
// Badges shown on a card, in order. Former and new status come from the faculty folder; the two repository badges are kept.
export const badges = (p, lastYear) => p.st === "external" ? ["External"] : p.st === "former" ? ["No longer connected to the university", ...(p.inactive ? [`No advisee in ${lastYear}`] : [])]
  : p.st === "new" && p.none ? ["New faculty, no advised theses yet"] : [p.none ? "Has not advised in this repository" : p.inactive ? `No advisee in ${lastYear}` : ""].filter(Boolean);
export const badge = (p, lastYear) => badges(p, lastYear)[0] || "";
export const canChair = (p, includeFormer = false) => p.adv.length > 0 && p.st !== "new" && (includeFormer || (p.st !== "former" && p.st !== "external"));

// ev: Map(row -> Float32Array) of vectors made in the browser (after the opt-in) for people whose people.bin row is zero, e.g. new faculty embedded from their expertise text.
// vecs: Int8Array (people.bin) or null; qvs: per-topic query vectors (Float32/array) or null when the model is not loaded.
export function analyze(people, ctx, topics, { vecs = null, qvs = null, ev = null, skip = null, all = false } = {}) {
  const list = people.list, D = 384, T = topics.length;
  const raw = list.map((p) => {
    const seen = new Set(), items = [...p.adv.map((a) => [a, "adv"]), ...p.aut.map((a) => [a, "own"])].filter(([a]) => a.id !== skip && !seen.has(a.id) && seen.add(a.id));
    return topics.map((t) => { const v = { adv: [], own: [], ij: [], intl: [] }, L = { adv: [], own: [], ij: [], intl: [] };
      for (const [a, role] of items) { const x = itemScore(ctx, a, t); if (x > 0) { const src = role === "own" && p.intlIds.has(a.id) ? "intl" : role; v[src].push(x * rw(ctx, a)); L[src].push([a, x]); } }
      for (const a of p.ij) { const x = ijScore(ctx, a, t); if (x > 0) { v.ij.push(x * recency(a.year, ctx.minY, ctx.span)); L.ij.push([a, x]); } }
      const m = { ...Object.fromEntries(Object.entries(v).map(([k, xs]) => [k, quality(xs)])), exp: expScore(ctx, p, t) }; // quality of the best matches, not their number
      const parts = Object.fromEntries(SRC.map((k) => [k, contrib(m[k], k)])); Object.values(L).forEach((l) => l.sort((x, y) => y[1] - x[1]));
      const g = (k) => L[k].map((z) => z[0]);
      return { lex: SRC.reduce((a, k) => a + parts[k], 0), parts, adv: g("adv"), aut: [...g("own"), ...g("intl")], ij: g("ij"), intl: g("intl") }; });
  });
  const sem = vecs && qvs && qvs.length >= T ? topics.map((_, t) => { const cs = list.map((_, r) => { let s = 0, z = 0; for (let k = 0; k < D; k++) { const v = vecs[r * D + k]; s += v * qvs[t][k]; z |= v; } if (!z && ev?.has(r)) { const e = ev.get(r); s = 0; for (let k = 0; k < D; k++) s += e[k] * qvs[t][k]; return s; } return z ? s / 127 : null; });
    const ok = cs.filter((x) => x !== null), lo = Math.min(...ok), hi = Math.max(...ok); return cs.map((x) => (x === null || hi === lo ? 0 : (x - lo) / (hi - lo))); }) : null;
  const mx = topics.map((_, t) => Math.max(1e-9, ...raw.map((r) => r[t].lex)));
  const rows = list.map((p, r) => {
    const per = topics.map((_, t) => { const x = raw[r][t], ln = x.lex / mx[t], sn = sem ? sem[t][r] : 0;
      return { ...x, sem: sn, s: sem ? 0.5 * ln + 0.5 * sn : ln, covered: x.lex > 0 || (!!sem && sn >= LEX_MIN_SEM) }; });
    const covN = per.filter((x) => x.covered).length, total = per.reduce((a, x) => a + x.s, 0) + 0.5 * Math.max(0, covN - 1); // bonus for covering more of the topics
    const mix = Object.fromEntries(SRC.map((k) => [k, per.reduce((a, x) => a + x.parts[k], 0)])), mixT = SRC.reduce((a, k) => a + mix[k], 0) || 1;
    const intl = intlShare(mix.ij + mix.intl, Math.max(1, T));
    return { p, per, covN, total, mix, mixShare: Object.fromEntries(SRC.map((k) => [k, mix[k] / mixT])), intl, chair: chairScore(total / Math.max(1, T), intl) };
  });
  rows.sort((x, y) => y.total - x.total || y.p.adv.length - x.p.adv.length || x.p.name.localeCompare(y.p.name));
  return all ? rows : rows.filter((r) => r.covN > 0 || !T);
}
// Sub-topics (top few) of the items that match the topics: the "complementary expertise" universe used when a panel has room left.
export function subUniverse(ctx, arts, topics, n = 5) {
  const m = new Map(); arts.forEach((a) => { if (topics.some((t) => itemScore(ctx, a, t) > 0)) a.subtopics.forEach((s) => m.set(s, (m.get(s) || 0) + 1)); });
  return [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, n).map((z) => z[0]);
}
// Greedy set cover: units = every input topic (weight 10) + a few sub-topics (weight 1). Chair = highest chair score (scoring.js) among people
// who have advised and are not new/former (former only with includeFormer). Then each next member adds the most uncovered units. fixed = members the user keeps.
export function panel(rows0, topics, subs, { size = 3, fixed = [], includeFormer = false } = {}) {
  const rows = rows0.filter((r) => includeFormer || (r.p.st !== "former" && r.p.st !== "external")); // former and external people only on request (members the user fixed stay)
  const units = (r) => new Set([...r.per.map((x, t) => x.covered && "t" + t).filter(Boolean), ...subs.filter((s) => [...r.p.adv, ...r.p.aut].some((a) => a.subtopics.includes(s))).map((s) => "s" + s)]);
  const w = (u) => (u[0] === "t" ? 10 : 1), members = [], got = new Set();
  const take = (r, role) => { const u = units(r), fresh = [...u].filter((x) => !got.has(x)); u.forEach((x) => got.add(x)); members.push({ row: r, role, newTopics: fresh.filter((x) => x[0] === "t").map((x) => +x.slice(1)), newSubs: fresh.filter((x) => x[0] === "s").map((x) => x.slice(1)) }); };
  fixed.forEach((r, i) => take(r, i === 0 ? "Chair" : "Member"));
  if (!members.length) { const pick = rows.filter((r) => canChair(r.p, includeFormer) && r.covN > 0).sort((x, y) => y.chair - x.chair || y.p.trackN - x.p.trackN || x.p.name.localeCompare(y.p.name))[0] || rows.find((r) => canChair(r.p, includeFormer)); if (pick) take(pick, "Chair"); } // chair: topic match x international boost; track record breaks exact ties only
  while (members.length < size) {
    const used = new Set(members.map((m) => m.row.p.i));
    const best = rows.filter((r) => !used.has(r.p.i)).map((r) => ({ r, g: [...units(r)].filter((x) => !got.has(x)).reduce((a, x) => a + w(x), 0) })).filter((z) => z.g > 0 || members.length < size)
      .sort((x, y) => y.g - x.g || y.r.total - x.r.total)[0];
    if (!best) break; take(best.r, "Member");
  }
  const uncovered = topics.map((_, t) => t).filter((t) => !got.has("t" + t));
  return { members, uncovered };
}
export const panelText = (topics, pn, lastYear) => [`Suggested advisory committee for: ${topics.map((t) => t.v).join("; ")}`,
  ...pn.members.map((m, i) => `${i + 1}. ${m.role}: ${titled(m.row.p)}${badge(m.row.p, lastYear) ? ` [${badge(m.row.p, lastYear)}]` : ""}${m.newTopics.length ? ` covers ${m.newTopics.map((t) => topics[t].v).join(", ")}` : ""}`),
  ...(pn.uncovered.length ? [`Not covered by anyone found: ${pn.uncovered.map((t) => topics[t].v).join(", ")}`] : []), "Suggestions only (AI-assisted ranking from this repository); not endorsements."].join("\n");

// Discovery: narrower thesis topics under an interest, from counts in the data only.
// interest: a topic {k,v}. Returns {n, tags:[[tag,n,lastYear]], pairs:[[a,b,n,lastYear]], gaps:[[a,b,nA,nB,n]]}
export function discover(ctx, arts, interest) {
  const m = arts.filter((a) => itemScore(ctx, a, interest) > 0), tc = new Map(), pc = new Map(), ly = new Map();
  const bump = (k, y) => { ly.set(k, Math.max(ly.get(k) || 0, y)); };
  m.forEach((a) => { const ts = [...new Set([...a.subjects, ...a.subtopics])].filter((t) => t !== interest.v);
    ts.forEach((t) => { tc.set(t, (tc.get(t) || 0) + 1); bump(t, a.year); });
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) { const k = [ts[i], ts[j]].sort().join("\u0000"); pc.set(k, (pc.get(k) || 0) + 1); bump(k, a.year); } });
  const tags = [...tc].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 8).map(([t, n]) => [t, n, ly.get(t)]);
  const pairs = [...pc].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => [...k.split("\u0000"), n, ly.get(k)]);
  const top = [...tc].filter(([, n]) => n >= 3).sort((x, y) => y[1] - x[1]).slice(0, 8).map((z) => z[0]), gaps = [];
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) { const n = pc.get([top[i], top[j]].sort().join("\u0000")) || 0; if (n <= 1) gaps.push([top[i], top[j], tc.get(top[i]), tc.get(top[j]), n]); }
  gaps.sort((x, y) => x[4] - y[4] || y[2] + y[3] - x[2] - x[3]);
  return { n: m.length, last: m.reduce((y, a) => Math.max(y, a.year), 0), tags, pairs, gaps: gaps.slice(0, 6) };
}
