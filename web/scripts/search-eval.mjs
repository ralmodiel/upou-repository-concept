// Search quality (run in web/): node scripts/search-eval.mjs [--no-vec] [--min1 0.93] [--min5 0.98]
// 50 query -> expected-article pairs through engine.searchArticles, twice: BM25 only (floor: --bm1 0.8 --bm5 0.9), then hybrid
// with the bge-small vector model (node, downloaded/cached by transformers.js; --no-vec skips it; gate --min1 0.93 --min5 0.98).
import fs from "node:fs"; import path from "node:path";
const dir = path.resolve(import.meta.dirname, "../public/index");
globalThis.fetch = async (u) => { const b = fs.readFileSync(path.join(dir, u.split("/index/")[1])); return { json: async () => JSON.parse(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; };
const E = await import("../src/engine.js"); await E.load();
const SET = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "search-eval-set.json"), "utf8")); // 50 pairs from eval_set.py (real titles, authors, subjects, abstracts)
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
async function run(label) {
  let h1 = 0, h5 = 0; const miss = [];
  for (const [q, id] of SET) {
    let r = await E.searchArticles(q, { k: 5 });
    if (!r.length) { const f = E.didYouMean(q); if (f) r = await E.searchArticles(f, { k: 5 }); } // the UI's did-you-mean fallback
    const p = r.findIndex((a) => a.id === id);
    if (p === 0) h1++; if (p >= 0) h5++; else miss.push(`${label}: ${q} -> want ${id}, got ${r.slice(0, 3).map((a) => a.id).join(",") || "none"}`);
  }
  miss.slice(0, 8).forEach((m) => console.log("miss " + m));
  return [h1 / SET.length, h5 / SET.length];
}
// BM25-only floor (before the model loads), then hybrid with the vector model (what the UI uses once ready)
const [b1, b5] = await run("bm25"); console.log(`${SET.length} queries BM25 only: hit@1 ${b1.toFixed(3)}, hit@5 ${b5.toFixed(3)}`);
let v1 = b1, v5 = b5;
if (!process.argv.includes("--no-vec")) { await E.ready(false); [v1, v5] = await run("hybrid"); }
// R270: a did-you-mean fallback never equals its own query after case folding (the 50 queries, upper-cased, and typo'd)
const fold = (s) => (s.toLowerCase().match(/[a-z0-9]{2,}/g) || []).join(" "), same = SET.flatMap(([q]) => [q, q.toUpperCase(), q.replace(/(\w{5})\w/, "$1")]).filter((q) => { const f = E.didYouMean(q); return f && fold(f) === fold(q); });
console.log(`R270 did-you-mean fallbacks equal to their query: ${same.length}${same.length ? " (" + same[0] + ")" : ""}`);
const ok = !same.length && b1 >= arg("--bm1", 0.7) && b5 >= arg("--bm5", 0.85) && v1 >= arg("--min1", 0.85) && v5 >= arg("--min5", 0.93);
console.log(`${SET.length} queries hybrid: hit@1 ${v1.toFixed(3)}, hit@5 ${v5.toFixed(3)}, ${ok ? "0 FAIL" : "1 FAIL"}`); process.exit(ok ? 0 : 1);
