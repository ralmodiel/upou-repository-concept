// Round 99 browser/device matrix: node scripts/matrix.mjs  (needs `vite preview` on :4195).
// Engines: Chromium, Firefox, WebKit (an engine that cannot launch on this host is SKIP, not FAIL).
// Cases: 3 phones, tablet, desktop at 200% zoom (640 CSS px), forced-colors (Chromium). Per page: h1 renders,
// no horizontal overflow, no page errors. Prints a table and "N checks, M FAIL"; exits 1 on any FAIL.
import { chromium, firefox, webkit } from "playwright-core";
import fs from "node:fs";
const U = process.env.U || "http://localhost:4195/#/";
const ROUTES = ["", "search/learning", "advanced", "maps", "issues"];
const CASES = [
  ["phone 360", { viewport: { width: 360, height: 740 }, hasTouch: true }],
  ["phone 390", { viewport: { width: 390, height: 844 }, hasTouch: true }],
  ["phone 430", { viewport: { width: 430, height: 932 }, hasTouch: true }],
  ["tablet 820", { viewport: { width: 820, height: 1180 }, hasTouch: true }],
  ["zoom 200%", { viewport: { width: 640, height: 450 } }], // 1280x900 at 200% = 640x450 CSS px
  ["forced-colors", { viewport: { width: 1280, height: 900 }, forcedColors: "active" }],
];
const cache = `${process.env.HOME}/.cache/ms-playwright`;
const exe = (re) => { const d = fs.readdirSync(cache).filter((f) => re.test(f)).sort().pop(); return d && `${cache}/${d}`; };
const ENGINES = [
  ["chromium", chromium, { executablePath: `${exe(/^chromium-\d/)}/chrome-linux64/chrome`, args: ["--no-sandbox"] }],
  ["firefox", firefox, {}], ["webkit", webkit, {}],
];
let n = 0, bad = 0; const rows = [];
for (const [name, eng, opts] of ENGINES) {
  let b; try { b = await eng.launch(opts); } catch (e) { rows.push([name, "all", "SKIP", String(e.message).split("\n").find((l) => /missing|error/i.test(l))?.slice(0, 90) || "cannot launch"]); continue; }
  for (const [cname, ctxo] of CASES) {
    if (ctxo.forcedColors && name !== "chromium") continue; // forced-colors emulation is Chromium-only in Playwright
    const ctx = await b.newContext(ctxo); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    const fails = [];
    for (const r of ROUTES) {
      await p.goto(U + r); const ok = await p.locator("main h1").first().waitFor({ timeout: 15000 }).then(async () => !/not found/i.test(await p.locator("main h1").first().textContent()), () => false);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (!ok || over > 1) fails.push(`${r || "/"}${ok ? "" : " no h1"}${over > 1 ? ` +${over}px` : ""}`);
    }
    if (errs.length) fails.push(`errors: ${errs[0].slice(0, 60)}`);
    n++; if (fails.length) bad++; rows.push([name, cname, fails.length ? "FAIL" : "ok", fails.join("; ")]);
    await ctx.close();
  }
  await b.close();
}
for (const r of rows) console.log(r.map((c, i) => String(c).padEnd([9, 14, 5, 0][i])).join(" | "));
console.log(`${n} checks, ${bad} FAIL, ${rows.filter((r) => r[2] === "SKIP").length} engines skipped`); process.exit(bad ? 1 : 0);
