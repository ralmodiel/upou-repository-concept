// Advanced search fuzz (run in web/): node scripts/adv-fuzz.mjs [cases=3000]
// Pulls hit() and run() out of src/Advanced.jsx and compares them on random chip combos (Required/Boost/Expand/Exclude,
// Boost H/L chips that also sit in other areas, words chips, mode any/one) with a brute-force reference written from the
// spec. Prints "N cases, M mismatch" and exits 1 on any mismatch.
import fs from "node:fs"; import path from "node:path";
const web = path.resolve(import.meta.dirname, ".."), src = fs.readFileSync(path.join(web, "src/Advanced.jsx"), "utf8");
const grab = (re) => { const m = src.match(re); if (!m) { console.log("FAIL cannot find code: " + re); process.exit(1); } return m[0]; };
const code = grab(/const hit = [\s\S]*?;\n/) + grab(/function run\(areas, words, mode\) \{[\s\S]*?\n\}\n/);
const arts = JSON.parse(fs.readFileSync(path.join(web, "public/index/articles.json"), "utf8"));
const colKey = (a) => (a.collection || "other").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""); // same as App.jsx colKey (journal issues became repository collections)
const window = { __S: { articles: arts } };
const run = new Function("window", "colKey", code + "; return run;")(window, colKey);
let seed = 7; const rnd = (n) => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return Math.floor((((t ^ (t >>> 14)) >>> 0) / 2 ** 32) * n); }, pick = (l) => l[rnd(l.length)]; // mulberry32
// a few "words" chips: random article sets with relevance, the shape run() reads (Map id -> rel, .passages)
const words = new Map(["w0", "w1", "w2"].map((w) => { const m = new Map(); arts.forEach((a) => rnd(4) || m.set(a.id, 1 + rnd(9))); m.passages = new Map(); return [w, m]; }));
const chip = () => { const a = pick(arts), k = pick(["category", "tag", "author", "collection", "year", "pub", "words"]);
  const v = { category: pick(a.categories), tag: a.subjects.length ? pick(a.subjects) : "none", author: pick(a.authors), collection: colKey(a), year: String(a.year), pub: a.id, words: pick([...words.keys()]) }[k];
  return { k, v, l: v }; };
const has = (c, a) => ({ category: () => a.categories.includes(c.v), tag: () => a.subjects.includes(c.v), author: () => a.authors.includes(c.v), collection: () => colKey(a) === c.v, year: () => String(a.year) === c.v, pub: () => a.id === c.v, words: () => words.get(c.v).has(a.id) })[c.k]();
function ref(ar, mode) {
  const out = new Map();
  for (const a of arts) {
    if (ar.exc.some((c) => has(c, a))) continue;
    const R = ar.req.every((c) => has(c, a)), E = ar.exp.some((c) => has(c, a));
    const keep = mode === "one" ? (!ar.req.length || R) && (!ar.exp.length || E) : (!ar.req.length && !ar.exp.length) || (ar.req.length && R) || (ar.exp.length && E);
    if (!keep) continue;
    let b = 0; ar.boost.forEach((c, i) => { if (has(c, a)) b += (c.h === "L" ? 0 : 100) + ar.boost.length - i; }); // Boost only ranks
    const wv = new Set([...ar.req, ...ar.exp, ...ar.boost].filter((c) => c.k === "words").map((c) => c.v)); // each words chip counts once
    out.set(a.id, b * 10 + [...wv].reduce((s, w) => s + (words.get(w).get(a.id) || 0), 0));
  }
  return out;
}
const N = +process.argv[2] || 3000; let bad = 0; const show = [];
for (let t = 0; t < N; t++) {
  const ar = { req: [], exp: [], exc: [], boost: [] }, used = new Set();
  for (let i = rnd(6); i-- > 0;) { const c = chip(), id = c.k + c.v; if (used.has(id)) continue; used.add(id); ar[pick(["req", "exp", "exc"])].push(c); }
  // Boost: new chips or copies of chips already in another area, H first then L
  for (let i = rnd(4); i-- > 0;) { const pool = [...ar.req, ...ar.exp, ...ar.exc], c = pool.length && rnd(2) ? pick(pool) : chip(); if (!ar.boost.some((b) => b.k === c.k && b.v === c.v)) ar.boost.push({ ...c, h: rnd(2) ? "H" : "L" }); }
  ar.boost.sort((a, b) => (a.h === "L") - (b.h === "L"));
  const mode = rnd(2) ? "one" : "any", got = run(ar, words, mode).rows, want = ref(ar, mode);
  const ok = got.length === want.size && got.every((r) => want.get(r.id) === r.score);
  if (!ok) { bad++; show.push(`${mode} ${JSON.stringify(ar).slice(0, 160)} got ${got.length} want ${want.size}`); }
}
show.slice(0, 5).forEach((s) => console.log("mismatch " + s));
console.log(`${N} cases, ${bad} mismatch`); process.exit(bad ? 1 : 0);
