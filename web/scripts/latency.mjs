// Round 48: search latency on the BUILT data (dist/index): node scripts/latency.mjs [--no-vec]   p50/p95 ms over the 50 eval queries x 3 passes.
// Lexical = BM25 over the 5 fields; hybrid = BM25 + query embedding + cosine over all passage vectors (+ RRF). Node CPU, so the browser at 4x CPU is slower: budgets are the plan's (100 / 400 ms) on this machine.
import fs from "node:fs"; import path from "node:path";
const dir = path.resolve(import.meta.dirname, "../dist/index");
globalThis.fetch = async (u) => { const b = fs.readFileSync(path.join(dir, u.split("/index/")[1])); return { json: async () => JSON.parse(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; };
const E = await import("../src/engine.js"); await E.load(); await E.search0("warm up", {}); // index build is a one-off per session
const Q = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "search-eval-set.json"), "utf8")).map((x) => x[0]);
const pct = (a, p) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
async function run(label, max) {
  const t = []; for (let r = 0; r < 3; r++) for (const q of Q) { const s = performance.now(); await E.searchArticles(q + (r ? " " : "").repeat(r), { k: 20 }); t.push(performance.now() - s); }
  const p50 = pct(t, 0.5), p95 = pct(t, 0.95), bad = p95 > max; console.log(`${bad ? "FAIL" : "PASS"} ${label}: p50 ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (budget p95 ${max}), n=${t.length}`); return bad;
}
let bad = await run("lexical", 100), n = 1;
if (!process.argv.includes("--no-vec")) { await E.ready(false); bad += await run("hybrid", 400); n++; }
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
