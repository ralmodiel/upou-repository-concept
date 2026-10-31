// Startup / transfer budget on dist (run after `vite build`): node scripts/budget.mjs   Prints gzip KB per group, exits 1 over budget.
// Startup = what the home route fetches with no opt-in: entry JS + CSS + index json + latin fonts (HTML excluded, ~4 KB); texts.json is counted apart.
import fs from "fs"; import path from "path"; import zlib from "zlib";
const d = path.join(import.meta.dirname, "..", "dist"), gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(d, f)), { level: 9 }).length / 1024, kb = (f) => fs.statSync(path.join(d, f)).size / 1024;
const html = fs.readFileSync(d + "/index.html", "utf8"), sw = fs.readFileSync(d + "/sw.js", "utf8");
const entry = html.match(/src="\.\/(assets\/index-[^"]+\.js)"/)[1], css = html.match(/href="\.\/(assets\/index-[^"]+\.css)"/)[1];
const fonts = fs.readdirSync(d + "/assets").filter((f) => /latin-(300|400|700)-normal.*\.woff2$/.test(f) && !/ext/.test(f)).map((f) => "assets/" + f);
const startup = { entry: gz(entry), css: gz(css), articles: gz("index/articles.json"), chunks: gz("index/chunks.json"), texts: gz("index/texts.json"), fonts: fonts.reduce((s, f) => s + kb(f), 0) };
const pre = JSON.parse(sw.match(/PRE = (\[.*?\]);/)[1]), precache = pre.filter((f) => !f.endsWith("/")).reduce((s, f) => s + gz(f), 0) + 4;
const late = startup.texts; delete startup.texts; // texts.json (one/two summaries + full abstracts) loads after first paint
const vec = kb("index/vecs.bin"), tot = (o) => Object.values(o).reduce((s, x) => s + x, 0);
const rows = [["startup gz KB before first paint (no opt-in)", tot(startup), +process.env.B_START || 500], ["texts.json gz KB (after first paint)", late, 1600], ["entry JS gz KB", startup.entry, 120], ["service-worker precache gz KB", precache, 2100], ["vecs.bin raw KB (opt-in only)", vec, 5000]];
let bad = 0; console.log("startup parts:", Object.entries(startup).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(", "));
for (const [n, v, max] of rows) { const o = v > max; if (o) bad++; console.log(`${o ? "FAIL" : "PASS"} ${n}: ${v.toFixed(0)} (budget ${max})`); }
console.log(`${rows.length} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
