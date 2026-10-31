// Suggestion quality (round 69, run in web/): node scripts/suggest-eval.mjs
// 30 seeded setups (one Required tag, category or author chip each, spread over the corpus). A shown suggestion counts as
// useful (accepted-suggestion proxy) when it would change the result one of two ways: as Required it keeps 1..n-1 of the n results,
// or as Expand it adds 1..max(6, 2n) chapters (not a flood). Prints precision per tuning, then the shipped one; exit 1 if the
// shipped tuning is not the best within 0.01 or precision < 0.6.
import fs from "node:fs"; import path from "node:path";
import { suggest, TUNE } from "../src/suggest.js";
const A = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../public/index/articles.json"), "utf8"));
const ik = (a) => a.issue ? a.issue.vol + "." + a.issue.no.replace("&", "-") : "";
const vals = (a, k) => k === "tag" ? a.subjects : k === "category" ? a.categories : k === "author" ? a.authors : [ik(a)];
const has = (a, c) => vals(a, c.k).includes(c.v);
const glob = new Map(); A.forEach((a) => ["tag", "category", "author", "issue"].forEach((k) => vals(a, k).forEach((v) => glob.set(k + "\0" + v, (glob.get(k + "\0" + v) || 0) + 1))));
const setups = Array.from({ length: 30 }, (_, i) => { const a = A[(i * 37) % A.length], k = ["tag", "category", "author"][i % 3]; return { k, v: vals(a, k)[0] }; }).filter((c) => c.v);
const evalT = (t) => { let shown = 0, good = 0;
  for (const c of setups) { const seed = A.filter((a) => has(a, c)), n = seed.length;
    const s = suggest({ seed, glob, used: new Set([c.k + c.v]), nAll: A.length, hasChips: true }, t).flatMap(([, l]) => l);
    for (const x of s) { shown++; const keep = seed.filter((a) => has(a, x)).length, add = A.filter((a) => !has(a, c) && has(a, x)).length;
      if ((keep >= 1 && keep <= n - 1) || (add >= 1 && add <= Math.max(6, 2 * n))) good++; } }
  return { shown, good, p: shown ? good / shown : 0 }; };
const grid = []; for (const w of [0, 0.5, 1, 2]) for (const dropAll of [false, true]) grid.push({ w, dropAll });
const res = grid.map((t) => ({ t, ...evalT(t) })).sort((x, y) => y.p - x.p || y.shown - x.shown);
res.slice(0, 5).forEach((r) => console.log(`w=${r.t.w} dropAll=${r.t.dropAll}: ${r.good}/${r.shown} = ${r.p.toFixed(3)}`));
const base = evalT({ w: 1, dropAll: false }), cur = evalT(TUNE), best = res[0].p;
console.log(`before (w=1, no noise filter): ${base.good}/${base.shown} = ${base.p.toFixed(3)}; shipped ${JSON.stringify(TUNE)}: ${cur.good}/${cur.shown} = ${cur.p.toFixed(3)}`);
// R240: the chip already set (even in another case) is never suggested back, and no kind lists a value twice ignoring case
let selfSug = 0;
for (const c of setups) { const seed = A.filter((a) => has(a, c)), key = (c.k + c.v).toUpperCase();
  for (const [, l] of suggest({ seed, glob, used: new Set([key]), nAll: A.length, hasChips: true })) { const v = l.map((s) => s.v.toLowerCase());
    selfSug += l.filter((s) => (s.k + s.v).toUpperCase() === key).length + (new Set(v).size < v.length); } }
console.log(`${setups.length} queries, ${selfSug} self/duplicate suggestions`);
const fail = (cur.p < best - 0.01) + (cur.p < 0.6) + (selfSug > 0);
console.log(`${setups.length} setups, 3 checks, ${fail} FAIL`); process.exit(fail ? 1 : 0);
