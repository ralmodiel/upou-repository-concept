// Browser checks: node e2e/ui.mjs  (needs `vite preview --port 4195`). Prints PASS/FAIL lines and "N checks, M FAIL"; exits 1 on any FAIL.
// Item ids are picked from the real articles.json, so it follows the data (restricted / no-PDF / adviser cases run only if present).
import { chromium } from "playwright-core";
import { homedir } from "os";
import { signIn, src } from "../scripts/adv-test.mjs";
const U = "http://localhost:4195", H = U + "/#";
const A = await (await fetch(U + "/index/articles.json")).json(), ADVS = new Map(src("index/articles.json").map((a) => [a.id, a.advisers || []])); // shipped articles.json has no adviser names: they arrive after login
A.forEach((a) => { a.advisers = ADVS.get(a.id) || []; });
const pick = (f) => A.find(f);
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1500 } });
await ctx.addInitScript(() => { try { if (!localStorage.getItem("upou-consent")) localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
const p = await ctx.newPage(), errs = [], csp = [], hosts = new Set();
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => /Content Security Policy/i.test(m.text()) && csp.push(m.text()));
p.on("request", (r) => { const h = new URL(r.url()).hostname; if (h && h !== "localhost") hosts.add(h); });
let n = 0, bad = 0;
const ok = (m, c, x = "") => { n++; console.log(`${c ? "PASS" : "FAIL"} ${m} ${x}`); if (!c) bad++; };
const txt = (loc) => loc.first().innerText().catch(() => "");
const go = async (r, sel = "h1") => { await p.goto(H + r); await p.waitForSelector(sel); await p.waitForTimeout(500); };

// ---- Home ----
await go("/"); await p.waitForTimeout(1500);
ok("home title", /UPOU Repository/.test(await p.title()), await p.title());
ok("home has collection shelves", await p.getByRole("heading", { name: "Newest items" }).count() > 0);
ok("home shows no journal vocabulary", !/\b(issues?|chapters?|IJODeL|journal)\b/i.test(await p.locator("header, footer, h1, h2").allInnerTexts().then((x) => x.join(" "))), (await p.locator("header, footer, h1, h2").allInnerTexts().then((x) => x.join(" "))).match(/.{0,25}\b(issues?|chapters?|IJODeL|journal)\b.{0,15}/i)?.[0]);
ok("header nav has Collections", await p.getByRole("link", { name: "Collections" }).count() > 0);
ok("no logo image is requested", await p.locator('img[src*="logo"]').count() === 0);

// ---- Collections, faculty, type pages ----
await go("/collections");
const nCol = new Set(A.map((a) => a.collection)).size;
ok("collections page lists every collection", await p.locator('a[href*="#/collection/"]').count() >= nCol, `(${nCol} in data)`);
const c1 = A[0].collection; const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
await go("/collection/" + slug(c1));
ok("collection page shows its name", (await txt(p.locator("h1"))).includes(c1.slice(0, 12)), await txt(p.locator("h1")));
await go("/type/" + A[0].type.toLowerCase().replace(/ /g, "-")).catch(() => {});
ok("type route renders without error", errs.length === 0, errs[0] || "");

// ---- Search ----
await go("/search/learning", "[role=status]"); await p.waitForFunction(() => /^[1-9]\d* of/.test([...document.querySelectorAll("[role=status]")].map((e) => e.textContent).join(" ").trim()) || [...document.querySelectorAll("[role=status]")].some((e) => /^[1-9]\d* of/.test(e.textContent)), null, { timeout: 20000 }).catch(() => {});
const total = async () => +(await txt(p.locator("[role=status]", { hasText: " of " }).locator("b"))) || 0;
const t0 = await total(); ok("search 'learning' finds items", t0 > 0, `(${t0})`);
const typeChip = p.getByRole("button", { name: /^(Article|Thesis|Presentation)\b/ }).first();
if (await typeChip.count()) { await typeChip.click(); await p.waitForTimeout(500); const t1 = await total(); ok("type chip narrows results", t1 > 0 && t1 <= t0, `(${t0}->${t1})`);
  await p.getByText("Clear all filters").first().click().catch(() => {}); await p.waitForTimeout(300); }
ok("faculty filter present", await p.getByLabel(/faculty/i).count() > 0);
ok("result cards show type and year", /Article|Thesis|Presentation|Student paper/.test(await txt(p.locator("main li:has(a[href*=\"/read/\"])"))));
await go("/search/zzzxqjvw", "[role=status]");
ok("empty search shows 0", await total() === 0);

// ---- Reader ----
const full = pick((a) => a.hasPdf && !a.restricted && a.doi) || pick((a) => a.hasPdf && !a.restricted);
await go("/read/" + full.id);
ok("reader title is the item title", (await txt(p.locator("h1"))).startsWith(full.title.slice(0, 20)));
ok("reader links out to the UPOU Repository", await p.locator('a[href^="https://repository.upou.edu.ph/"]').count() > 0);
ok("reader shows the DOI link when present", !full.doi || await p.locator('a[href*="doi.org/"]').count() > 0);
ok("reader never says download / read PDF", !/download|read the pdf/i.test(await p.locator("main").innerText()));
ok("page title changes per item", (await p.title()).includes(full.title.slice(0, 15)), await p.title());
const rs = pick((a) => a.restricted);
if (rs) { await go("/read/" + rs.id); ok("restricted item says full text restricted", /Full text restricted/.test(await p.locator("main").innerText())); }
const np = pick((a) => !a.hasPdf && !a.restricted);
if (np) { await go("/read/" + np.id); ok("no-PDF item says no full text available", /No full text available/i.test(await p.locator("main").innerText())); }
const th = pick((a) => a.type === "Thesis" && a.advisers.length);
if (th) { await go("/read/" + th.id); ok("thesis page hides the adviser while locked", !(await p.locator("main").innerText()).includes(th.advisers[0])); await signIn(p, U); await go("/read/" + th.id); await p.waitForTimeout(800); ok("thesis page shows the adviser after login", (await p.locator("main").innerText()).includes(th.advisers[0])); }
await p.goto(H + "/read/999999"); await p.waitForTimeout(800);
ok("unknown item id shows a not-found state", /not found|no item|couldn.t find/i.test(await p.locator("main").innerText()));
const cite = p.getByRole("button", { name: /cite/i }).first();
await go("/read/" + full.id);
if (await cite.count()) { await cite.click(); await p.waitForTimeout(300); ok("cite dialog offers BibTeX", /BibTeX/.test(await p.locator("header, footer, h1, h2").allInnerTexts().then((x) => x.join(" ")))); await p.keyboard.press("Escape"); }

// ---- Consent, lists, static pages ----
await go("/privacy");
ok("privacy notice present", /Republic Act No\. 10173/.test(await p.locator("article").innerText()));
ok("no Flag Counter anywhere", !/flag counter/i.test(await p.locator("article").innerText()));
await go("/about");
ok("about page renders", (await txt(p.locator("h1"))).length > 0);
await go("/read/" + full.id);
await p.getByRole("button", { name: /Add to (a )?view list|\+/ }).first().click().catch(() => {}); await p.waitForTimeout(300);
await go("/list");
ok("view list page renders", errs.length === 0);
await go("/maps"); ok("maps page renders", errs.length === 0, errs[0] || "");
await go("/advanced", "aside"); ok("advanced page renders", errs.length === 0, errs[0] || "");

// ---- Global ----
ok("only localhost was contacted (no model consent)", [...hosts].length === 0, `[${[...hosts].join(" ")}]`);
ok("no CSP violations", csp.length === 0, csp[0]?.slice(0, 160) || "");
ok("no page errors", errs.length === 0, errs[0] || "");
await b.close(); console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
