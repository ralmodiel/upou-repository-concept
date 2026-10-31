// Phone-width overflow check: node scripts/phone.mjs  (needs `vite preview` on :4195). Prints "N routes, M overflow"; exits 1 on overflow. Screenshots: SHOTS=dir.
import { chromium } from "playwright-core";
import { homedir } from "os";
import { signIn, src } from "./adv-test.mjs";
const top = src("index/people.json").reduce((a, x) => (x.adv.length > a.adv.length ? x : a)); // the adviser with the most theses: the fullest map
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: +(process.env.W || 390), height: 844 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, model: false })); } catch {} });
const p = await ctx.newPage();
const routes = ["/", "/search/learning", "/advanced", "/maps", "/read/14", "/collections", "/collection/fics-scholarly-articles", "/faculty/faculty-of-education", "/topics", "/advisers", "@signin", "/advisers", "/maps/adviser/" + top.s]; let bad = 0;
for (const r of routes) {
  if (r === "@signin") { await signIn(p, "http://localhost:4195"); continue; }
  await p.goto("http://localhost:4195/#" + r); await p.waitForTimeout(1500);
  const o = await p.evaluate(() => { const w = document.documentElement.clientWidth; const off = [...document.body.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > w + 1 && !e.closest(".row-track, [class*=overflow-x], [class*=overflow-hidden], svg, canvas") && getComputedStyle(e).position !== "fixed"; }).slice(0, 3).map((e) => e.tagName + "." + String(e.className).slice(0, 40)); return { over: document.documentElement.scrollWidth > w, off }; });
  if (o.over) { bad++; console.log("OVERFLOW", r, o.off.join(" | ")); }
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/p${r.replace(/\W+/g, "_")}.png` });
}
// Overlap probe: floating controls (fixed elements, plus absolutely placed buttons over the map) must not cover each other.
// Fresh visitor (cookie banner up) on home, the map at rest and in full screen.
const float = () => { const vis = (e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && r.bottom > 0 && r.top < innerHeight; };
  const els = [...document.querySelectorAll("body *")].filter((e) => { const c = getComputedStyle(e); return (c.position === "fixed" && !/inset-0/.test(e.className)) || (c.position === "absolute" && e.tagName === "BUTTON"); }).filter(vis).filter((e, _, a) => !a.some((o) => o !== e && o.contains(e)));
  const hits = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect(); if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push([els[i], els[j]].map((e) => e.tagName + ":" + (e.getAttribute("aria-label") || e.textContent).slice(0, 30)).join(" x ")); }
  return { n: els.length, hits }; };
let overlap = 0;
for (const [label, r, fresh, fs] of [["home, fresh visitor", "/", true], ["home, decided", "/", false], ["maps", "/maps", false], ["maps full screen", "/maps", false, true], ["reader", "/read/14", false]]) {
  const c2 = await b.newContext({ viewport: { width: +(process.env.W || 390), height: 844 }, hasTouch: true, isMobile: true });
  if (!fresh) await c2.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, model: false })); } catch {} });
  const q = await c2.newPage(); await q.goto("http://localhost:4195/#" + r); await q.waitForTimeout(1500);
  if (fs) { await q.getByRole("button", { name: "Full screen map" }).click().catch(() => {}); await q.waitForTimeout(600); await q.locator("svg g[data-node]").first().click().catch(() => {}); await q.waitForTimeout(300); }
  const o = await q.evaluate(float); if (o.hits.length) { overlap++; console.log("OVERLAP", label, o.hits.slice(0, 3).join(" | ")); }
  await c2.close();
}
console.log(`${routes.length} routes, ${bad} overflow; 5 overlap probes, ${overlap} overlap`); bad += overlap; await b.close(); process.exit(bad ? 1 : 0);
