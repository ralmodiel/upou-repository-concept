// Release check (run in web/): node scripts/verify.mjs [--all]
// Builds, then checks budgets (gzip KB), sitemap vs read pages, JSON-LD, no ijodel / dead asset refs in dist.
// --all also runs: node scripts/boolq-check.mjs ; cite-check.mjs ; planner-queries.mjs ; node scripts/a11y.mjs ; node scripts/phone.mjs ; node e2e/ui.mjs (e2e needs `npx vite preview` on :4195).
// Prints "N checks, M FAIL" and exits 1 on any failure.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib"; import { execSync } from "node:child_process";
const web = path.resolve(import.meta.dirname, ".."), dist = path.join(web, "dist");
let n = 0, bad = 0;
const check = (ok, msg) => { n++; if (!ok) bad++; fs.writeSync(1, `${ok ? "ok  " : "FAIL"} ${msg}\n`); };
const run = (cmd) => { try { execSync(cmd, { cwd: web, stdio: "pipe" }); return true; } catch { return false; } };
check(run("npx vite build"), "vite build");
const gz = (f) => zlib.gzipSync(fs.readFileSync(f)).length / 1024;
const assets = fs.readdirSync(path.join(dist, "assets")).map((f) => path.join(dist, "assets", f));
const sum = (fs_) => Math.round(fs_.reduce((s, f) => s + gz(f), 0));
for (const [name, files, max] of [
  ["entry JS", assets.filter((f) => /index-.*\.js$/.test(f)), 140],
  ["CSS", assets.filter((f) => f.endsWith(".css")), 30],
  ["startup data", ["articles.json", "chunks.json"].filter((f) => fs.existsSync(path.join(dist, "index", f))).map((f) => path.join(dist, "index", f)), 600], // 785 items with abstracts and AI summaries
]) { const kb = sum(files); check(kb <= max, `${name} ${kb} KB gz (budget ${max})`); }
const reads = fs.readdirSync(path.join(dist, "read")).filter((d) => fs.existsSync(path.join(dist, "read", d, "index.html")));
const locs = (fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8").match(/<loc>[^<]*\/read\/[^<]+<\/loc>/g) || []).length;
check(reads.length > 0 && locs === reads.length, `sitemap read urls ${locs} = read pages ${reads.length}`);
const htmls = [path.join(dist, "index.html"), ...reads.map((d) => path.join(dist, "read", d, "index.html"))];
let ld = 0, ldBad = 0, brand = 0, dead = [];
for (const f of htmls) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { ld++; try { JSON.parse(m[1]); } catch { ldBad++; } }
  if (s.includes("ijodel")) brand++;
  for (const [, u] of s.matchAll(/(?:src|href)="([^"#?]+)"/g)) if (!/^[a-z]+:/.test(u) && !u.endsWith("/") && !fs.existsSync(path.resolve(path.dirname(f), u))) dead.push(path.relative(dist, f) + " -> " + u);
}
check(ld > 0 && !ldBad, `JSON-LD blocks parse (${ld} found, ${ldBad} bad)`);
check(!brand && !assets.some((f) => fs.readFileSync(f, "latin1").includes("ijodel")), "no leftover IJODeL branding in dist");
for (const src of fs.readdirSync(path.join(web, "src"))) for (const [, u] of fs.readFileSync(path.join(web, "src", src), "utf8").matchAll(/asset\("([^"]+)"\)/g)) if (!fs.existsSync(path.join(dist, u))) dead.push(`src/${src} -> ${u}`);
check(!dead.length, `asset references resolve (${dead.length} dead${dead.length ? ": " + dead.slice(0, 5).join(", ") : ""})`);
if (process.argv.includes("--all")) for (const c of ["node scripts/boolq-check.mjs", "node scripts/cite-check.mjs", "node scripts/planner-queries.mjs", "node scripts/a11y.mjs", "node scripts/phone.mjs", "timeout 118 node e2e/ui.mjs"]) check(run(c), c);
fs.writeSync(1, `${n} checks, ${bad} FAIL\n`); process.exit(bad ? 1 : 0);
