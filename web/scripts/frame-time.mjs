// Typing smoothness: node scripts/frame-time.mjs  (needs `vite preview` on :4195 with a fresh build).
// Types a query key by key (120 ms apart, like a person) into the search box on Home and Search, with the real 116
// records and with 1000 synthetic ones (articles/texts copied under new ids through page.route), worker on and off
// (window.__noWorker = in-thread fallback). Per run: long tasks (>50 ms) and rAF frame gaps while typing (on /search
// also the submitted search until its results show).
// Budget (worker runs only): typing 0 long tasks and no frame gap over 50 ms; submitted search 0 long tasks. Exits 1 over budget.
import { chromium } from "playwright-core";
import { homedir } from "os";
import fs from "fs";
import path from "path";
const dist = path.join(import.meta.dirname, "..", "dist", "index"), U = "http://localhost:4195/#";
const A = JSON.parse(fs.readFileSync(path.join(dist, "articles.json"))), TX = JSON.parse(fs.readFileSync(path.join(dist, "texts.json")));
const big = Array.from({ length: 1000 }, (_, k) => { const a = A[k % A.length]; return k < A.length ? a : { ...a, id: a.id + "-s" + k, title: a.title + " " + k, related: [] }; });
const bigT = Object.fromEntries(big.map((a, k) => [a.id, TX[A[k % A.length].id]]));
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const Q = "open distance learnig quality";
let bad = 0;
for (const n of [116, 1000]) for (const worker of [true, false]) for (const route of ["/", "/search"]) for (let tryN = 1; tryN <= 2; tryN++) { // a worker run over budget gets one retry: software-GL compositor noise
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((w) => {
    localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, model: false }));
    if (!w) window.__noWorker = true;
    window.__f = { lt: [], gaps: [], on: false };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__f.on && window.__f.lt.push(Math.round(e.duration)))).observe({ type: "longtask" });
    let last = 0; const tick = (t) => { if (window.__f.on && last) window.__f.gaps.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  }, worker);
  if (n > 116) {
    await ctx.route(/index\/articles\.json/, (r) => r.fulfill({ json: big }));
    await ctx.route(/index\/texts\.json/, (r) => r.fulfill({ json: bigT }));
  }
  const p = await ctx.newPage();
  await p.goto(U + route); await p.getByLabel("Search chapters").first().waitFor();
  if (n > 116 && await p.evaluate(() => window.__S.articles.length) !== 1000) { console.log("FAIL synthetic records not loaded"); bad++; }
  const box = p.getByLabel("Search chapters").first(); await box.click(); await p.waitForTimeout(1500); // first focus warms the worker
  await p.evaluate(() => { window.__f.on = true; });
  for (const ch of Q) { await p.keyboard.press(ch === " " ? "Space" : ch); await p.waitForTimeout(120); } // keyboard, not locator.press: its actionability checks hit-test the 46k-node page through DevTools and stall frames themselves
  await p.waitForTimeout(500);
  const f = await p.evaluate(() => { const r = structuredClone(window.__f); window.__f.lt = []; window.__f.gaps = []; return r; });
  const g = f.gaps.sort((x, y) => x - y), p95 = g[Math.floor(g.length * 0.95)] || 0, max = g.at(-1) || 0, slow = g.filter((x) => x > 50).length;
  let sub = "", sl = 0;
  if (route === "/search") { // the submitted search (BM25 + fusion, then rendering the cards): long tasks only, frames there include the results render
    await p.keyboard.press("Enter"); await p.waitForFunction((q) => document.querySelector("[role=status]")?.textContent.includes(q), Q, { timeout: 20000 }); await p.waitForTimeout(300);
    const s2 = await p.evaluate(() => window.__f.lt); sl = s2.length; sub = ` | submit longtasks=${sl}${sl ? " (max " + Math.max(...s2) + "ms)" : ""}`;
  }
  const over = worker && (f.lt.length > 0 || max > 50 || sl > 0), retry = over && tryN === 1; if (over && !retry) bad++;
  console.log(`${retry ? "RETRY" : over ? "FAIL" : worker ? "PASS" : "INFO"} n=${n} ${worker ? "worker  " : "inthread"} ${route.padEnd(7)} typing frames=${g.length} p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms gaps>50ms=${slow} longtasks=${f.lt.length}${f.lt.length ? " (max " + Math.max(...f.lt) + "ms)" : ""}${sub}`);
  await ctx.close();
  if (!retry) break;
}
await b.close();
console.log(`${bad} FAIL`); process.exit(bad ? 1 : 0);
