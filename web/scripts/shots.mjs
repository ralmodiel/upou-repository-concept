// Screenshots for visual triage: node scripts/shots.mjs <outdir> [w=1300]  (needs vite preview on :4195). Light + dark, 6 routes, viewport-only PNGs.
import { chromium } from "playwright-core";
import { homedir } from "os";
const [out, w = "1300"] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const routes = { home: "/", search: "/search/learning", adv: "/advanced", read: "/read/14", maps: "/maps", issue: "/issue/" };
let n = 0;
for (const scheme of ["light"]) {
  const ctx = await b.newContext({ viewport: { width: +w, height: 900 }, colorScheme: scheme });
  await ctx.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, model: false })); } catch {} });
  const p = await ctx.newPage();
  for (const [k, r] of Object.entries(routes)) { await p.goto("http://localhost:4195/#" + r); await p.waitForTimeout(1800); await p.screenshot({ path: `${out}/${k}-${scheme}-${w}.png` }); n++; }
  await ctx.close();
}
console.log(`${n} shots in ${out}`); await b.close();
