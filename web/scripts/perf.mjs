// Cold-load profile on throttled 4G + 4x CPU: node scripts/perf.mjs [--update]  (reads dist/, so run `vite build` first).
// Serves dist with gzip (like GitHub Pages) on :4179. Prints LCP, CLS, long-task total (TBT-ish), transfer KB per route; exits 1 over budget.
import { chromium } from "playwright-core";
import { homedir } from "os";
import http from "http";
import zlib from "zlib";
import fs from "fs";
import path from "path";
const dist = path.join(import.meta.dirname, "..", "dist"), PORT = +(process.env.PORT || 4179);
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".bin": "application/octet-stream" };
const gz = new Map();
const srv = http.createServer((q, r) => {
  let f = path.join(dist, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
  if (!f.startsWith(dist) || !fs.existsSync(f)) { r.writeHead(404).end(); return; }
  const ext = path.extname(f); let body = fs.readFileSync(f); const h = { "content-type": T[ext] || "application/octet-stream" };
  if ([".html", ".js", ".css", ".json", ".bin"].includes(ext)) { if (!gz.has(f)) gz.set(f, zlib.gzipSync(body, { level: 9 })); body = gz.get(f); h["content-encoding"] = "gzip"; }
  h["content-length"] = body.length; r.writeHead(200, h).end(body);
}).listen(PORT);
// budgets: LCP ms, CLS, long-task ms, transfer KB (measured after rounds 27/28/31 plus headroom for 4x-CPU noise; search fetches per-article passages since round 29b; KB now includes the worker fetches) Round 47: re-measured after the abstract split (home 453 KB, LCP ~3.0 s); KB and LCP tightened.
const B = { "/collections": { lcp: 3500, cls: 0.02, tbt: 600, kb: 700 }, "/": { lcp: 3500, cls: 0.02, tbt: 600, kb: 700 }, "/collections chip": { r: "/collections", chip: 1, lcp: 3500, cls: 0.02, tbt: 600, kb: 700 }, "/search/libre": { lcp: 3500, cls: 0.02, tbt: 600, kb: 700 }, "/read/14": { lcp: 3500, cls: 0.02, tbt: 600, kb: 700 }, "/maps": { lcp: 3500, cls: 0.02, tbt: 1000, kb: 700 }, "/advanced": { lcp: 3500, cls: 0.02, tbt: 1000, kb: 700 }, "/issues": { lcp: 3500, cls: 0.02, tbt: 800, kb: 700 } };
// round 81: field targets (LCP 2.5 s, INP 200 ms, CLS 0.02) are reported per route; budgets above stay the lab gate on 4x CPU
const FIELD = { lcp: 2500, inp: 200, cls: 0.02 };
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
// JS heap after GC, page plus its workers (the search worker holds its own copy of the index). Workers are reached by a
// non-flat CDP auto-attach on the page session, since playwright gives no CDP session for a worker.
const watchWorkers = async (c) => {
  const ws = new Set(), wait = new Map(); let id = 0;
  c.on("Target.attachedToTarget", (e) => { if (e.targetInfo.type === "worker") ws.add(e.sessionId); });
  c.on("Target.receivedMessageFromTarget", (e) => { const m = JSON.parse(e.message); wait.get(m.id)?.(m.result); });
  await c.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
  const ask = (sessionId, method) => new Promise((ok) => { const i = ++id; wait.set(i, ok); c.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id: i, method }) }).catch(() => ok(null)); setTimeout(() => ok(null), 5000); });
  return async () => {
    await c.send("HeapProfiler.collectGarbage").catch(() => {});
    let t = (await c.send("Runtime.getHeapUsage")).usedSize;
    for (const s of ws) { await ask(s, "HeapProfiler.collectGarbage"); t += (await ask(s, "Runtime.getHeapUsage"))?.usedSize || 0; }
    return t / 2 ** 20;
  };
};
let bad = 0; const rows = [], shifts = [];
for (const [name, bud] of Object.entries(B)) { const route = bud.r || name;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, model: false })); } catch {}
    window.__m = { lcp: 0, cls: 0, tbt: 0, inp: 0 };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.interactionId) window.__m.inp = Math.max(window.__m.inp, e.duration); })).observe({ type: "event", durationThreshold: 16, buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__m.lcp = e.startTime; window.__m.el = (e.element?.tagName || "?") + (e.url ? ":" + e.url.split("/").pop() : ""); })).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) { window.__m.cls += e.value; (window.__m.shifts ||= []).push(e.value.toFixed(3) + " " + e.sources.map((x) => x.node?.nodeName + "." + String(x.node?.className || "").slice(0, 30)).join(",")); } })).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__m.tbt += Math.max(0, e.duration - 50); })).observe({ type: "longtask", buffered: true });
  });
  const p = await ctx.newPage(), c = await ctx.newCDPSession(p); let bytes = 0;
  p.on("pageerror", (e) => console.log("pageerror", route, String(e).slice(0, 120))); p.on("crash", () => console.log("crash", route)); p.on("requestfailed", (r) => console.log("reqfail", route, r.url().slice(-40), r.failure()?.errorText));
  await c.send("Network.enable"); const heap = await watchWorkers(c);
  p.on("requestfinished", async (r) => { const z = await r.sizes().catch(() => null); if (z) bytes += z.responseBodySize + z.responseHeadersSize; }); // counts the worker's fetches too
  await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await c.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const go = async () => { await p.goto(`http://localhost:${PORT}/#${route}`, { waitUntil: "load", timeout: 60000 }); await p.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1500); return p.evaluate(() => window.__m); };
  let m = await go(); if (!m.lcp) { bytes = 0; m = await go(); }; // INP: tap the "Topics" tab (a real in-app route change) and read the longest event duration
  await (bud.chip ? p.locator("main button[aria-pressed]").first() : p.locator('nav[aria-label=Main] a', { hasText: "Topics" })).tap().catch(() => {}); // chip rows (R226) are held to the 200 ms field INP await p.waitForTimeout(1500); m.inp = await p.evaluate(() => window.__m.inp);
  const mb = await heap(), kb = Math.round(bytes / 1024); if (m.shifts) shifts.push(route + ": " + m.shifts.join(" | "));
  const over = [m.inp > (bud.chip ? FIELD.inp : 500) && "INP", m.lcp > bud.lcp && "LCP", m.cls > bud.cls && "CLS", m.tbt > bud.tbt && "TBT", kb > bud.kb && "KB"].filter(Boolean);
  if (over.length) bad++;
  rows.push(`${name.padEnd(17)} LCP ${String(Math.round(m.lcp)).padStart(5)} ms  CLS ${m.cls.toFixed(3)}  long-task ${String(Math.round(m.tbt)).padStart(5)} ms  INP ${String(Math.round(m.inp)).padStart(4)} ms  field ${m.lcp <= FIELD.lcp && m.inp <= FIELD.inp && m.cls <= FIELD.cls ? "met" : "miss"}  ${String(kb).padStart(5)} KB  heap ${mb.toFixed(1).padStart(5)} MB  ${over.length ? "OVER " + over.join(",") : "ok"}  [${m.el}]`);
  await ctx.close();
}
if (process.env.DEBUG) console.log(shifts.join('\n'));
console.log(rows.join("\n")); console.log(`${rows.length} routes, ${bad} over budget`);
await b.close(); srv.close(); process.exit(bad ? 1 : 0);
