// Round 33 (needs `vite preview` on :4195): node scripts/sanitise-fuzz.mjs
// Injects hostile strings into EVERY string of a fixture copy of the index (articles, texts, FAQs; served via route interception)
// and renders home, search, reader, collections, maps, lists. Pass = no script ran (window.__xss unset), no injected element/attribute
// (onerror, <script>, <img src=x>), no CSP violation, no dialog, no uncaught error. Also: src has no innerHTML/dangerouslySetInnerHTML,
// and every built page in dist/read/ has only the ld+json and r.js scripts and valid JSON-LD. Prints "N checks, M FAIL".
import { chromium } from "playwright-core"; import { homedir } from "os"; import { readdirSync, readFileSync } from "fs";
const U = "http://localhost:4195", web = new URL("..", import.meta.url).pathname;
const X = ["<img src=x onerror=window.__xss=1>", '"><script>window.__xss=1</script>', "<svg onload=window.__xss=1>", "javascript:window.__xss=1", "</script><script>window.__xss=1</script>",
  "[click](javascript:window.__xss=1) **bold** <a href=javascript:window.__xss=1>x</a>", "{{constructor.constructor('window.__xss=1')()}} ${window.__xss=1} `${1}`", "‮\u0000\ud800 <style>*{display:none}</style>", "' onmouseover='window.__xss=1' x='"];
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; if (!c) { bad++; console.log(`FAIL ${m} ${x}`); } };
const src = readdirSync(web + "src").filter((f) => /\.jsx?$/.test(f)).map((f) => readFileSync(web + "src/" + f, "utf8")).join("\n");
ok("src has no innerHTML / dangerouslySetInnerHTML / insertAdjacentHTML / document.write / eval / new Function", !/dangerouslySetInnerHTML|\.innerHTML\s*=(?!\s*"")|insertAdjacentHTML|document\.write\s*\(|(?<![-\w.])eval\s*\(|new\s+Function\s*\(/.test(src));
let k = 0; const evil = (v, key = "") => typeof v === "string" ? (key === "id" ? v : X[k++ % X.length]) : Array.isArray(v) ? v.map((x) => evil(x, key)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, evil(b, a)])) : v;
const art = JSON.parse(readFileSync(web + "public/index/articles.json", "utf8")), ids = art.slice(0, 40).map((a) => a.id), tx = {};
for (const a of art) tx[a.id] = { one: a.one, two: a.two };
const bad1 = (id) => ({ id }); void bad1;
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} window.__v = []; document.addEventListener("securitypolicyviolation", (e) => window.__v.push(e.violatedDirective + " " + e.blockedURI)); });
await ctx.route("**/index/articles.json", (r) => r.fulfill({ json: art.map((a, i) => i < 40 ? evil(a) : a).map((a, i) => ({ ...a, id: art[i].id })) }));
await ctx.route("**/index/texts.json", (r) => r.fulfill({ json: Object.fromEntries(Object.entries(tx).map(([id, v], i) => [id, i < 40 ? evil(v) : v])) }));
await ctx.route("**/index/faq/*.json", (r) => r.fulfill({ json: [{ article: "x", q: X[0], a: X[1], kind: "key" }, { article: "x", q: X[5], a: X[8], kind: "x" }] }));
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => { errs.push("dialog " + d.message()); d.dismiss(); });
const routes = ["/", "/search/" + encodeURIComponent("<img src=x>"), "/search/learning", "/collections", "/faculty", "/topics", "/advanced", "/privacy", "/list", ...ids.slice(0, 6).flatMap((i) => ["/read/" + i, "/maps/pub/" + i]), "/search/e"];
for (const r of routes) {
  await p.goto(U + "/#" + r).catch(() => {}); await p.waitForSelector("h1, h2", { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(500);
  if (r.startsWith("/read/")) { await p.locator("#r-faq summary").first().click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(400); } // FAQs load on expand (R257)
  const f = await p.evaluate(() => ({ x: window.__xss, v: window.__v.slice(0, 2), el: document.querySelectorAll("#root script, #root [onerror], #root [onload], #root [onmouseover], #root img[src='x'], #root style").length, js: [...document.querySelectorAll("#root a[href]")].filter((a) => /^\s*javascript:/i.test(a.getAttribute("href"))).length }));
  ok("hostile index at " + r, !f.x && !f.v.length && !f.el && !f.js && !errs.length, JSON.stringify(f) + (errs[0] || "")); errs.length = 0;
}
// R259: a shared list name renders without bidi overrides or control characters, capped at 40 characters
await p.goto(U + "/#/list/share/" + encodeURIComponent("‮gnp.exe\u0007‏⁦" + "x".repeat(80)) + "/" + ids[0]).catch(() => {}); await p.waitForSelector("h1", { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(400);
const ln = (await p.locator("h1").first().innerText().catch(() => "")).replace(/^Shared view list: /, "");
ok("shared list name has no bidi/control characters and is <= 40 characters", ln.startsWith("gnp.exe") && !/[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/.test(ln) && ln.length <= 40, JSON.stringify(ln));
await b.close();
const dir = web + "dist/read", pages = readdirSync(dir).filter((f) => f.endsWith(".html") || !f.includes(".")).slice(0, 800); let sc = 0, pg = 0;
for (const d of pages) { let h; try { h = readFileSync(`${dir}/${d}${d.endsWith(".html") ? "" : "/index.html"}`, "utf8"); } catch { continue; } pg++;
  const s = [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  if (s.some(([, a, body]) => a.includes("ld+json") ? (() => { try { JSON.parse(body); return false; } catch { return true; } })() : !/^ src="\.\.\/\.\.\/r\.js" data-id="[\w-]+"$/.test(a))) sc++; }
ok(`${pg} built read pages: only ld+json (valid) and r.js scripts`, pg > 0 && !sc, sc + " bad");
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
