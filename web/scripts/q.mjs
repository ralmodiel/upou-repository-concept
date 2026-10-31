// Try queries: node scripts/q.mjs [--no-vec] "query" ...  (top 5 titles, BM25 then hybrid)
import fs from "node:fs"; import path from "node:path";
const dir = path.resolve(import.meta.dirname, "../public/index");
globalThis.fetch = async (u) => { const b = fs.readFileSync(path.join(dir, u.split("/index/")[1])); return { json: async () => JSON.parse(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), ok: true }; };
const E = await import("../src/engine.js"); await E.load();
const qs = process.argv.slice(2).filter((a) => a[0] !== "-");
const show = async (tag) => { for (const q of qs) { const r = await E.searchArticles(q, { k: 5 }); console.log(tag, JSON.stringify(q), r.map((x) => (x.a || x).id + ":" + String((x.a || x).title).slice(0, 40)).join(" | ") || "(none)"); } };
await show("bm25"); if (!process.argv.includes("--no-vec")) { await E.ready(false); await show("hybrid"); }
