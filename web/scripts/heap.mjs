// Long-session leak check (round 85; needs `vite preview` on :4195): node scripts/heap.mjs [navs=200]
// Cycles hash routes (home, search, reader, Advanced, Maps 2D, issues, topics, lists) N times in one tab. After forced GC compares
// JS heap, DOM nodes and event listeners at nav 20 vs nav N. FAIL if heap grows > 8 MB or listeners/nodes grow > 25%.
import { chromium } from "playwright-core"; import { homedir } from "os";
const N = +process.argv[2] || 200, U = "http://localhost:4195/#";
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem("upou-consent", JSON.stringify({ prefs: true })));
const p = await ctx.newPage(), c = await ctx.newCDPSession(p); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await c.send("Performance.enable");
const R = ["/", "/search/online learning", "/read/14", "/advanced", "/maps", "/collections", "/topics", "/list", "/read/14", "/search/mooc"];
const snap = async () => { await p.waitForTimeout(500); await c.send("HeapProfiler.collectGarbage"); const m = Object.fromEntries((await c.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  return { heap: m.JSHeapUsedSize / 2 ** 20, nodes: m.Nodes, ls: m.JSEventListeners }; };
await p.goto(U + "/"); await p.waitForSelector("h1, h2");
if (process.argv.includes("idle")) { // R266: node scripts/heap.mjs idle - the search worker ends 60 s after leaving the search route, and search works again on return
  await p.clock.install(); const hash = (h) => p.evaluate((x) => { location.hash = x; }, h);
  await hash("/search/learning"); await p.waitForSelector("[role=status]", { timeout: 20000 }); await p.waitForTimeout(1500); const w0 = p.workers().length;
  await hash("/"); await p.clock.fastForward(30000); await p.waitForTimeout(200); const w30 = p.workers().length; await p.clock.fastForward(35000); await p.waitForTimeout(500); const w65 = p.workers().length;
  await hash("/search/mooc"); await p.waitForSelector("ul.grid-pubs > li", { timeout: 20000 }).catch(() => {}); const hits = await p.locator("ul.grid-pubs > li").count(), w2 = p.workers().length;
  const rows = [["worker running on the search route", w0 === 1], ["worker still alive after 30 s idle", w30 === 1], ["worker gone after 65 s idle off search", w65 === 0], ["search works again after the restart (worker back)", hits > 0 && w2 === 1]];
  let bad = errs.length; for (const [n, g] of rows) { bad += !g; console.log(`${g ? "PASS" : "FAIL"} R266 ${n}`); }
  console.log(`worker idle ${w0}/${w30}/${w65}/${w2} workers, ${hits} hits, ${rows.length} checks, ${bad} FAIL`); await b.close(); process.exit(bad ? 1 : 0);
}
if (process.argv.includes("maps")) { // R246/R247: node scripts/heap.mjs maps - heap after leaving /maps (<= 15 MB over before) and after 5 open/close cycles of the 3D map (<= 10 MB growth)
  const to = async (r, sel) => { await p.evaluate((h) => { location.hash = h; }, r); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); await p.waitForTimeout(1500); };
  const three = async () => { await to("/maps/pub/14", "button[aria-pressed]"); await p.getByRole("button", { name: "3D", exact: true }).click(); await p.waitForSelector("canvas", { timeout: 20000 }); await p.waitForTimeout(1500); };
  const pre = await snap(); await three(); await to("/"); const post = await snap();
  const g0 = post.heap; for (let i = 0; i < 5; i++) { await three(); await to("/"); } const g1 = await snap();
  const rows = [["R246 heap after leaving /maps vs before", pre.heap, post.heap, post.heap - pre.heap > 15], ["R247 heap after 5 more 3D open/close cycles vs after the first", g0, g1.heap, g1.heap - g0 > 10]];
  let bad = errs.length; for (const [n, x, y, f] of rows) { bad += f; console.log(`${f ? "FAIL" : "PASS"} ${n}: ${x.toFixed(1)} -> ${y.toFixed(1)} MB (delta ${(y - x).toFixed(1)})`); }
  console.log(`maps heap, ${rows.length} checks, ${bad} FAIL`); await b.close(); process.exit(bad ? 1 : 0);
}
let a; for (let i = 1; i <= N; i++) { await p.evaluate((r) => { location.hash = r; }, R[i % R.length]); await p.waitForTimeout(120); if (i === 20) a = await snap(); }
await p.evaluate(() => { location.hash = "/"; }); await p.waitForTimeout(800); const z = await snap();
const rows = [["heap MB", a.heap, z.heap, z.heap - a.heap > 8], ["DOM nodes", a.nodes, z.nodes, z.nodes > a.nodes * 1.25 + 200], ["listeners", a.ls, z.ls, z.ls > a.ls * 1.25 + 50]];
let bad = 0; for (const [n, x, y, f] of rows) { bad += f; console.log(`${f ? "FAIL" : "PASS"} ${n} at 20: ${x.toFixed(1)} at ${N}: ${y.toFixed(1)}`); }
if (errs.length) { bad++; console.log("FAIL page errors: " + errs.slice(0, 2).join(" | ")); }
console.log(`${N} navigations, ${rows.length + 1} checks, ${bad} FAIL`); await b.close(); process.exit(bad ? 1 : 0);
