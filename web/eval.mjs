// Offline eval of the browser engine. Synthetic queries (not human-written): treat as a regression guide, not a final score.
//  A) article search: each FAQ question should find its own article in the top 5 (keyword-only vs hybrid).
import fs from "node:fs";
globalThis.fetch = async (u) => { const p = "public/index/" + String(u).split("index/")[1], buf = fs.readFileSync(p);
  return { json: async () => JSON.parse(buf.toString()), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; };
const E = await import("./src/engine.js");
const S = await E.load();
const sample = (a, n) => a.filter((_, i) => i % Math.ceil(a.length / n) === 0).slice(0, n);
const hit = async (qs, fn) => { let h = 0; for (const [q, id] of qs) h += (await fn(q)).slice(0, 5).some((a) => a.id === id) ? 1 : 0; return h; };
const qa = sample(S.faqs, 100).map((f) => [f.q, f.article]);
const lex = await hit(qa, (q) => E.searchArticles(q));
await E.ready(console.log);
const hyb = await hit(qa, (q) => E.searchArticles(q));
console.log(`A) article search hit@5 over ${qa.length} FAQ-question queries: keyword-only ${lex}, hybrid ${hyb}`);
let ans = 0, ok = 0;
