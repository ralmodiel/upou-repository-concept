// Hosting headers check (rounds 86/93): node scripts/headers.mjs [https://live.host/path/]
// No URL: checks dist/_headers (CSP equals the index.html meta CSP plus frame-ancestors, the security headers, cache rules).
// With a URL: fetches the page, an asset, sw.js and an index file from the live host and checks the same headers plus
// compression and caching. GitHub Pages cannot set headers: expect FAIL there for CSP/HSTS-preload/frame-ancestors (see docs/hosting.md).
import fs from "fs"; import crypto from "crypto"; import path from "path";
const web = path.join(import.meta.dirname, ".."), url = process.argv[2];
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; console.log(`${c ? "PASS" : "FAIL"} ${m} ${x}`); if (!c) bad++; };
const meta = fs.readFileSync(path.join(web, "index.html"), "utf8").match(/Content-Security-Policy" content="([^"]*)"/)[1];
const SEC = { "content-security-policy": (v) => v.includes(meta) && /frame-ancestors 'none'/.test(v), "strict-transport-security": (v) => /max-age=(\d+)/.exec(v)?.[1] >= 15552000,
  "x-content-type-options": (v) => v === "nosniff", "referrer-policy": (v) => /strict-origin/.test(v), "permissions-policy": (v) => /camera=\(\)/.test(v) };
if (!url) {
  const h = fs.readFileSync(path.join(web, "dist/_headers"), "utf8"), block = (p) => Object.fromEntries((h.split(/^(?=\S)/m).find((b) => b.startsWith(p + "\n")) || "").split("\n").slice(1).filter(Boolean).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]; }));
  const all = block("/*"); for (const [k, f] of Object.entries(SEC)) ok(`_headers /* ${k}`, all[k] && f(all[k]));
  const idx = fs.readFileSync(path.join(web, "dist/index.html"), "utf8"), sty = (idx.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []), csp = idx.match(/Content-Security-Policy" content="([^"]*)"/)?.[1] || "";
  ok("index.html: every inline style block has its sha256 in style-src", sty.every((t) => csp.includes(`'sha256-${crypto.createHash("sha256").update(t.replace(/^<style[^>]*>|<\/style>$/g, "")).digest("base64")}'`)), sty.length + " blocks");
  for (const d of ["frame-src 'none'", "media-src 'none'", "manifest-src 'self'"]) ok(`CSP ${d} in meta and _headers`, meta.includes(d) && all["content-security-policy"].includes(d));
  ok("_headers COOP and CORP same-origin", all["cross-origin-opener-policy"] === "same-origin" && all["cross-origin-resource-policy"] === "same-origin");
  ok("_headers Trusted Types trial (report-only)", /require-trusted-types-for/.test(all["content-security-policy-report-only"] || ""));
  ok("_headers assets immutable", /immutable/.test(block("/assets/*")["cache-control"] || ""));
  ok("_headers k.json no-cache (R138)", /no-cache/.test(block("/index/k.json")["cache-control"] || ""));
  ok("_headers Permissions-Policy denies all listed features (R139)", ["camera", "microphone", "geolocation", "payment", "usb", "serial", "interest-cohort"].every((f) => all["permissions-policy"]?.includes(f + "=()")));
  ok("_headers k.json and /index/a/* noindex (R148)", /noindex/.test(block("/index/k.json")["x-robots-tag"] || "") && /noindex/.test(block("/index/a/*")["x-robots-tag"] || ""));
  ok("_headers sw.js not cached", /no-cache/.test(block("/sw.js")["cache-control"] || ""));
} else {
  const get = async (p) => { const r = await fetch(new URL(p, url), { headers: { "accept-encoding": "gzip, br" } }); return { s: r.status, h: r.headers }; };
  const page = await get("./"), html = await (await fetch(url)).text(), js = html.match(/assets\/index-[^"]+\.js/)?.[0];
  for (const [k, f] of Object.entries(SEC)) ok(`live ${k}`, page.h.get(k) && f(page.h.get(k)), page.h.get(k) ? "" : "(missing; meta CSP still applies)");
  ok("live page compressed", /gzip|br/.test(page.h.get("content-encoding") || ""));
  if (js) { const a = await get(js); ok("live asset cached >= 1 day", +(/max-age=(\d+)/.exec(a.h.get("cache-control") || "")?.[1] || 0) >= 86400, a.h.get("cache-control") || ""); }
  const sw = await get("sw.js"); ok("live sw.js served", sw.s === 200);
  const ix = await get("index/articles.json"); ok("live index compressed", /gzip|br/.test(ix.h.get("content-encoding") || ""));
}
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
