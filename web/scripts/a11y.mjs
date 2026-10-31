// Axe check: node scripts/a11y.mjs  (needs `vite preview` on :4195). Light and dark schemes. Prints "N pages, M violations" + top rule ids; exits 1 on violations.
import { chromium } from "playwright-core";
import { createRequire } from "module";
import { readFileSync } from "fs";
import { homedir } from "os";
import { signIn } from "./adv-test.mjs";
const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const rules = {}; let n = 0, pages = 0;
for (const scheme of ["light", "dark"]) {
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, colorScheme: scheme });
await ctx.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, model: false })); } catch {} });
const p = await ctx.newPage();
const routes = ["/", "/search/libre", "/advanced", "/read/14", "/maps", "/privacy", "/advisers", "@signin", "/advisers"];
for (const r0 of routes) { const r = r0.replace("?signed-in", ""); if (r0 === "@signin") { await signIn(p, "http://localhost:4195"); continue; } pages++;
  await p.goto("http://localhost:4195/#" + r); await p.waitForTimeout(1500);
  const v = (await p.evaluate(async (src) => { (0, eval)(src); return (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }, rules: { "color-contrast": { enabled: true } }, resultTypes: ["violations"] })).violations.map((x) => [x.id, x.nodes.length, x.nodes[0].target.join(" ")]); }, axeSrc));
  v.forEach(([id, c, t]) => { n += c; rules[id] = (rules[id] || 0) + c; console.log(scheme, r, id, c, t.slice(0, 80)); });
}
await ctx.close(); }
console.log(`${pages} pages, ${n} violations`, Object.entries(rules).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, c]) => `${k}:${c}`).join(" "));
await b.close(); process.exit(n ? 1 : 0);
