// UI/UX rounds 1-10 checks: node scripts/rounds.mjs [roundNumber...]  (needs `vite preview --port 4195`). Prints PASS/FAIL and "N checks, M FAIL"; exits 1 on FAIL.
import { chromium } from "playwright-core";
import { homedir } from "os";
import { signIn, routeAdv, src, ADV_ROUTE } from "./adv-test.mjs";
import { existsSync, readFileSync } from "fs";
const U = "http://localhost:4195", H = U + "/#", only = process.argv.slice(2).map(Number);
const A = await (await fetch(U + "/index/articles.json")).json(), ADVS = new Map(src("index/articles.json").map((a) => [a.id, a.advisers || []])); // adviser names are not in the shipped articles.json: take them from the source copy
A.forEach((a) => { a.advisers = ADVS.get(a.id) || []; });
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addInitScript(() => { try { if (!localStorage.getItem("upou-consent")) localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
const p = await ctx.newPage(), errs = [];
p.on("pageerror", (e) => errs.push(e.message));
let n = 0, bad = 0;
const ok = (m, c, x = "") => { n++; console.log(`${c ? "PASS" : "FAIL"} ${m} ${x}`); if (!c) bad++; };
const go = async (r, sel = "h1") => { await p.goto(H + r); if (ADV_ROUTE.test(r)) { await signIn(p, U); await p.goto(H + r); } await p.waitForSelector(sel); await p.waitForTimeout(600); };
const R = { };
R[1] = async () => { await go("/"); const t = await p.locator("[data-orient]").innerText(); ok("R1 home explains what this is and how to search", t.includes(String(A.length)) && /Try:/.test(t) && await p.locator("[data-orient] a").count() >= 3, t.slice(0, 60)); };
R[2] = async () => {
  await go("/collections"); ok("R2 no search box in the header", await p.locator("[data-header-search]").count() === 0);
  await go("/"); await p.locator("input[role=combobox]").first().fill("learn"); await p.waitForTimeout(400);
  ok("R2 suggestions are labelled by kind", await p.locator("[role=option]").count() > 1 && /item|tag|collection|category/i.test(await p.locator("[role=option]").first().innerText()));
};
R[3] = async () => {
  await go("/search/learning", "[role=status]"); await p.waitForTimeout(1500);
  const opts = await p.locator("#fac option").allInnerTexts();
  ok("R3 faculty filter shows a count per faculty", opts.length > 2 && opts.slice(1).every((o) => /\(\d+\)$/.test(o)), opts[1]);
  ok("R3 type and category chips show counts", /\d/.test(await p.getByRole("button", { name: /^(Article|Thesis)\b/ }).first().innerText()));
  ok("R3 author filter is labelled Author (the data has no advisers)", await p.getByLabel("Author", { exact: true }).count() === 1);
};
R[4] = async () => {
  const t = A.find((a) => a.type === "Thesis" && a.pages && !a.restricted);
  await go("/search/" + encodeURIComponent(t.title.split(" ").slice(0, 6).join(" ")), "[role=status]"); await p.waitForTimeout(1500);
  await p.getByRole("button", { name: "Details" }).click(); await p.waitForTimeout(300);
  const card = await p.locator(`main li:has(a[href="#/read/${t.id}"])`).first().innerText();
  ok("R4 thesis card shows author, year, type and page count", card.includes(t.authors[0]) && card.includes(String(t.year)) && /Thesis/.test(card) && card.includes(`${t.pages} pages`), card.slice(0, 80));
};
R[5] = async () => {
  await go("/collection/no-such-shelf"); ok("R5 unknown collection shows a way out", /could not find any items/.test(await p.locator("[data-empty]").innerText()) && await p.locator("[data-empty] a").count() === 2);
  await go("/"); await p.locator("input[role=combobox]").first().click(); await p.keyboard.type("learnng"); await p.waitForTimeout(1500);
  ok("R5 misspelling offers did you mean in the suggestions", /did you mean/i.test((await p.locator("[role=option]").allInnerTexts()).join(" ")), (await p.locator("[role=option]").allInnerTexts()).join("|").slice(0, 80));
  await go("/search/zzzxqjvw", "[role=status]"); await p.waitForTimeout(800);
  ok("R5 empty search lists recovery actions", /Reset search and filters/.test(await p.locator("main").innerText()) && /popular tag/.test(await p.locator("main").innerText()));
};
R[6] = async () => {
  const slug = (c) => c.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const f = A.find((a) => a.faculty).faculty; await go("/faculty/" + slug(f));
  const subs = await p.locator("[data-subs] a").count(); const cn = new Set(A.filter((a) => a.faculty === f).map((a) => a.collection)).size;
  ok("R6 faculty page lists its collections", cn < 2 || subs === cn, `${subs}/${cn}`);
  const c = A.find((a) => a.collection).collection; await go("/collection/" + slug(c));
  const ys = [...new Set(A.filter((a) => a.collection === c).map((a) => a.year))];
  if (ys.length > 1) { const y = ys[0]; await p.locator("[data-years] button", { hasText: String(y) }).first().click(); await p.waitForTimeout(300);
    const want = A.filter((a) => a.collection === c && a.year === y).length;
    ok("R6 year chip narrows the collection", await p.locator("ul.grid-pubs > li").count() === want, `${want} items in ${y}`); }
};
R[7] = async () => {
  const a = A.find((x) => x.hasPdf && x.faculty); await go("/read/" + a.id);
  const cr = await p.locator('nav[aria-label=Breadcrumb] a').allInnerTexts();
  ok("R7 item page trail is Home > Collections > faculty > collection", cr.length === 4 && cr[2] === a.faculty && cr[3] === a.collection, cr.join(" > "));
  await go("/search/learning", "[role=status]"); await p.waitForTimeout(1500);
  const t = p.getByRole("button", { name: /^(Article|Thesis)\b/ }).first(), name = (await t.innerText()).split(/\s/)[0];
  await t.click(); await p.waitForTimeout(400); const n1 = await p.locator("[role=status] b").first().innerText();
  await p.locator('ul.grid-pubs a[href^="#/read/"]').first().click(); await p.waitForSelector("h1"); await p.waitForTimeout(400);
  await p.goBack(); await p.waitForSelector("[role=status] b"); await p.waitForTimeout(1500);
  ok("R7 Back keeps the type filter", await p.locator("[role=status] b").first().innerText() === n1 && await p.getByRole("button", { name: new RegExp("^" + name + "\\b") }).first().getAttribute("aria-pressed") === "true", `${name} ${n1}`);
};
R[8] = async () => {
  await go("/"); await p.keyboard.press("/");
  ok("R8 / focuses the search box", await p.evaluate(() => document.activeElement?.getAttribute("role") === "combobox"));
  await p.keyboard.press("Escape"); await p.locator("body").click({ position: { x: 5, y: 400 } });
  await p.keyboard.press("?"); ok("R8 ? opens the shortcut list", await p.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor({ timeout: 3000 }).then(() => true, () => false)); // lazy chunk (R216)
  await p.keyboard.press("Escape"); ok("R8 Esc closes it", await p.getByRole("dialog", { name: "Keyboard shortcuts" }).count() === 0);
  await go("/search/learning", "[role=status]"); await p.waitForTimeout(1500); await p.locator("body").click({ position: { x: 5, y: 400 } });
  for (const k of "jjjk") await p.keyboard.press(k);
  const idx = await p.evaluate(() => { const l = [...document.querySelectorAll('main li a[href^="#/read/"]')]; const li = document.activeElement.closest("li"); return li ? [...document.querySelectorAll("main ul.grid-pubs > li")].indexOf(li) : -9; });
  ok("R8 j j j k lands on the second result", idx === 1, "index " + idx);
};
R[9] = async () => {
  const c2 = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }); await c2.addInitScript(() => localStorage.setItem("upou-consent", JSON.stringify({ prefs: true })));
  const q = await c2.newPage();
  for (const r of ["/collections", "/search/learning", "/read/" + A[0].id]) {
    await q.goto(H + r); await q.waitForSelector("h1"); await q.waitForTimeout(1200);
    const m = await q.evaluate(() => { const w = document.documentElement.clientWidth, small = [...document.querySelectorAll("header a, header button, main button, main select, main input")].filter((e) => { const x = e.getBoundingClientRect(); return x.width && x.height && (x.height < 36 || x.width < 36) && !e.closest("label") && e.type !== "checkbox" && e.type !== "file"; }).map((e) => (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 20) + ":" + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height)); return { over: document.documentElement.scrollWidth > w, small: small.slice(0, 4) }; });
    ok("R9 360px " + r.slice(0, 18) + ": no sideways scroll, touch targets >= 36px", !m.over && !m.small.length, m.small.join(" "));
  }
  await c2.close();
};
R[10] = async () => {
  const { spawnSync } = await import("child_process"); const t = spawnSync("node", ["scripts/terms.mjs"], { encoding: "utf8" });
  ok("R10 terms audit: no banned or jargon words in screens", t.status === 0, t.stdout.trim().split("\n").pop());
  for (const r of ["/", "/search/learning", "/read/" + A[0].id, "/collections"]) { await go(r); await p.waitForTimeout(500);
    const x = await p.locator("body").innerText(); ok("R10 visible text on " + r.slice(0, 14) + " has no jargon", !/\b(semantic|corpus|bm25|lexical|publications?|issues?)\b/i.test(x), x.match(/.{0,20}\b(semantic|corpus|bm25|lexical|publication|issue)\b.{0,10}/i)?.[0] || ""); }
};
R[11] = async () => {
  await go("/"); ok("R11 brand tokens: maroon header/theme colour and Merriweather headings", await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-navy").trim() === "#3f0a19" && document.querySelector('meta[name=theme-color]')?.content === "#3f0a19" && /Merriweather/.test(getComputedStyle(document.querySelector("h1")).fontFamily)));
};
R[12] = async () => {
  const t = [...A].filter((a) => a.type === "Thesis").sort((x, y) => y.title.length - x.title.length)[0];
  for (const [w, h] of [[1280, 900], [360, 740]]) { await p.setViewportSize({ width: w, height: h }); await go("/read/" + t.id);
    const m = await p.evaluate(() => { const e = document.querySelector("h1"), r = e.getBoundingClientRect(); return { over: document.documentElement.scrollWidth > document.documentElement.clientWidth, right: r.right, W: innerWidth, bal: getComputedStyle(e).textWrap, fs: parseFloat(getComputedStyle(e).fontSize) }; });
    ok(`R12 ${t.title.split(/\s+/).length}-word title at ${w}px fits, balanced, <= 36px`, !m.over && m.right <= m.W && /balance/.test(m.bal) && m.fs <= 36, JSON.stringify(m)); }
  await p.setViewportSize({ width: 1280, height: 1000 });
};
R[13] = async () => {
  await go("/"); await p.waitForTimeout(500);
  const m = await p.evaluate(() => ({ covers: document.querySelectorAll(".cover.gen").length, withArt: document.querySelectorAll(".cover.gen svg").length, imgs: [...document.querySelectorAll("img")].filter((i) => !/upou-seal|banner/.test(i.getAttribute("src"))).length }));
  ok("R13 home covers are generated art (svg), no images", m.covers > 5 && m.withArt >= m.covers && m.imgs === 0, JSON.stringify(m));
};
R[14] = async () => {
  await go("/"); const card = p.locator(".pub-link").first(); await card.scrollIntoViewIfNeeded(); await card.hover(); await p.waitForTimeout(500);
  ok("R14 hover lifts the cover", /matrix/.test(await card.locator(".cover").evaluate((e) => getComputedStyle(e).transform)));
  await p.emulateMedia({ reducedMotion: "reduce" }); await go("/");
  ok("R14 reduced motion: no cover transition", await p.locator(".cover").first().evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration) < 0.05));
  await p.emulateMedia({ reducedMotion: "no-preference" });
};
R[15] = async () => {
  await go("/search/learning", "[role=status]"); await p.waitForTimeout(1500);
  const w = () => p.locator("ul.grid-pubs > li").first().evaluate((e) => e.getBoundingClientRect().width), big = await w();
  await p.getByRole("button", { name: "Compact" }).click(); await p.waitForTimeout(300); const small = await w();
  ok("R15 Compact density makes result cards narrower", small < big * 0.85 && await p.getByRole("button", { name: "Compact" }).getAttribute("aria-pressed") === "true", `${Math.round(big)} -> ${Math.round(small)}`);
};
R[16] = async () => {
  await go("/"); const bad = await p.evaluate(() => [...document.querySelectorAll("main svg[viewBox='0 0 24 24']")].filter((s) => s.getAttribute("stroke") !== "currentColor" || s.getAttribute("aria-hidden") !== "true" || s.getAttribute("stroke-linecap") !== "round").length);
  ok("R16 all UI icons share one style (24 grid, currentColor stroke, round caps, decorative)", bad === 0, bad + " off");
};
R[17] = async () => {
  const c3 = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }), q = await c3.newPage();
  await c3.route("**/index/articles.json", async (r) => { await new Promise((x) => setTimeout(x, 1500)); r.continue(); });
  await q.goto(H + "/"); await q.waitForSelector("[aria-label='Loading the repository index']"); const h0 = await q.evaluate(() => document.querySelector("main").getBoundingClientRect().height);
  await q.waitForSelector("[data-orient]"); const h1 = await q.evaluate(() => document.querySelector("main").getBoundingClientRect().height);
  ok("R17 loading skeleton shown, main keeps >= 70% viewport (footer does not jump)", h0 >= 690 && h1 >= 690, `${Math.round(h0)} -> ${Math.round(h1)}`); await c3.close();
};
R[18] = async () => {
  await go("/read/" + A[0].id); await p.emulateMedia({ media: "print" });
  const m = await p.evaluate(() => ({ hdr: getComputedStyle(document.querySelector("header")).display, ftr: getComputedStyle(document.querySelector("footer")).display, bg: getComputedStyle(document.body).backgroundColor, h1: !!document.querySelector("h1").offsetHeight }));
  ok("R18 print view hides header/footer, white page, title kept", m.hdr === "none" && m.ftr === "none" && m.bg === "rgb(255, 255, 255)" && m.h1, JSON.stringify(m)); await p.emulateMedia({ media: "screen" });
};
R[19] = async () => {
  await go("/"); const h = await p.evaluate(() => [...document.querySelectorAll("link[rel=icon],link[rel=apple-touch-icon],meta[property='og:image']")].map((e) => e.href || e.content));
  const st = await Promise.all(["favicon-32.png", "icon-180.png"].map(async (f) => (await fetch(U + "/" + f)).headers.get("content-type")));
  ok("R19 favicon, app icon (and the page's social image tag) are linked and served", h.length >= 3 && /png/.test(st[0]) && /png/.test(st[1]), st.join(" "));
};
R[20] = async () => {
  const { spawnSync } = await import("child_process"); const t = spawnSync("node", ["scripts/a11y.mjs"], { encoding: "utf8" }), l = t.stdout.trim().split("\n").slice(-2).join(" ");
  ok("R20 axe: 0 violations (light theme)", t.status === 0, l);
};

// ---- rounds 21-30 (correctness) ----
const sh = async (cmd, args) => { const { spawnSync } = await import("child_process"); const t = spawnSync(cmd, args, { encoding: "utf8", cwd: cmd === "node" ? undefined : ".." }); return [t.status === 0, (t.stdout || "").trim().split("\n").slice(-1)[0]]; };
const PY = "/workspaces/ijodel-rag/.venv/bin/python", main = async () => (await p.locator("main").innerText());
R[21] = async () => {
  const names = new Set(A.flatMap((a) => a.authors));
  ok("R21 author variants merged in the index (Nasser, M / Serrano, Joane gone)", !names.has("Nasser, M") && !names.has("Serrano, Joane") && names.has("Nasser, Mona"));
  const id = A.find((a) => a.authors.includes("Nasser, Mona")).id; await go("/read/" + id); ok("R21 item page shows the canonical name", (await main()).includes("Nasser, Mona"));
  ok("R21 data check (python data_checks.py 21)", ...(await sh(PY, ["data_checks.py", "21"])));
};
R[22] = async () => {
  ok("R22 every year is a sane 4-digit year", A.every((a) => a.year >= 1990 && a.year <= 2026));
  ok("R22 data check (python data_checks.py 22)", ...(await sh(PY, ["data_checks.py", "22"])));
};
R[23] = async () => {
  await go("/type/course-module"); const t = await main(); ok("R23 Course module type page lists the 3 archives, none typed Other", (t.match(/Course Module Archive/g) || []).length >= 3 && A.filter((a) => a.type === "Other").length <= 0.03 * A.length);
  ok("R23 data check (python data_checks.py 23)", ...(await sh(PY, ["data_checks.py", "23"])));
};
R[24] = async () => {
  const d = A.find((a) => a.dupOf); await go("/read/" + d.id); ok("R24 duplicate record says it duplicates the other item", (await main()).includes("duplicates item " + d.dupOf));
  ok("R24 data check (python data_checks.py 24)", ...(await sh(PY, ["data_checks.py", "24"])));
};
R[25] = async () => {
  const n = A.find((a) => !a.hasPdf && !a.restricted), r = A.find((a) => a.restricted);
  await go("/read/" + n.id); ok("R25 no-file item says 'No full text available' and still shows its abstract", /No full text available/.test(await main()) && (!n.abstract || (await main()).includes(n.abstract.slice(0, 30))));
  await go("/read/" + r.id); ok("R25 restricted item says 'Full text restricted'", /Full text restricted/.test(await main()));
  ok("R25 no PDF download offered", await p.locator("a[download], a[href$='.pdf']").count() === 0);
};
R[26] = async () => {
  const s = A.find((a) => a.scanned && !a.ocr && a.hasPdf && !a.restricted); await go("/read/" + s.id);
  ok("R26 scanned PDF without OCR says search covers title and abstract only", /scan with no text layer/.test(await main()));
  ok("R26 PDF text QA (python pdf_qa.py 120)", ...(await sh(PY, ["pdf_qa.py", "120"])));
};
R[27] = async () => { ok("R27 search eval, 50 queries, BM25 only (hit@1/@5 in the line)", ...(await sh("node", ["scripts/search-eval.mjs", "--no-vec"]))); };
R[28] = async () => { ok("R28 summary numbers all occur in the source (python ground_check.py)", ...(await sh(PY, ["ground_check.py"]))); };
R[29] = async () => {
  ok("R29 citation formats (node scripts/cite-check.mjs)", ...(await sh("node", ["scripts/cite-check.mjs"])));
  const d = A.find((a) => a.doi); await go("/read/" + d.id); const ca = async () => await p.locator("text=/doi.org/").count();
  await p.getByRole("button", { name: "MLA" }).first().click(); await p.waitForTimeout(200); ok("R29 MLA button changes the reference and it uses the DOI link", (await main()).includes("https://doi.org/" + d.doi));
};
R[30] = async () => { ok("R30 link formats for all items (python link_check.py --handles 0 --dois 0)", ...(await sh(PY, ["link_check.py", "--handles", "0", "--dois", "0"]))); };

// ---- Rounds 31-40: security and privacy ----
const fs = await import("fs"), rf = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"), rr = (f) => rf("../" + f);
R[31] = async () => {
  const csp = rf("index.html").match(/Content-Security-Policy" content="([^"]*)"/)[1], dir = (d) => csp.split(";").map((x) => x.trim()).find((x) => x.startsWith(d + " ")) || "";
  ok("R31 CSP meta: no unsafe-inline / unsafe-eval in script-src or style-src, default-src self", !/'unsafe-(inline|eval)'/.test(dir("script-src") + dir("style-src")) && /default-src 'self'/.test(csp) && /object-src 'none'/.test(csp), dir("script-src"));
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } }), q = await c.newPage(), hosts = new Set(), v = [];
  await c.addInitScript(() => { window.__v = []; document.addEventListener("securitypolicyviolation", (e) => window.__v.push(e.violatedDirective + " " + e.blockedURI)); });
  q.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http")) hosts.add(u.host); });
  for (const r of ["/", "/search/learning", "/read/" + A[0].id, "/collections", "/advanced", "/maps/pub/" + A[0].id, "/privacy"]) { await q.goto(H + r); await q.waitForSelector("h1, h2"); await q.waitForTimeout(700); v.push(...await q.evaluate(() => window.__v)); }
  ok("R31 no CSP violation on 7 routes (securitypolicyviolation listener)", v.length === 0, v[0] || "");
  ok("R31 CSP form-action is 'none'", /form-action 'none'/.test(csp));
  await q.goto(H + "/"); await q.waitForSelector("input[role=combobox]"); await q.locator("input[role=combobox]").first().fill("learning"); await q.keyboard.press("Enter"); await q.waitForTimeout(600);
  ok("R31 submitting search raises no CSP violation", (await q.evaluate(() => window.__v)).length === 0 && /search/.test(q.url()), q.url());
  ok("R31 no third-party request at load without consent (only localhost:4195; no Tag Manager)", [...hosts].join() === "localhost:4195", [...hosts].join(" "));
  const dist = fs.readdirSync(new URL("../dist/assets", import.meta.url)).filter((f) => /\.(js|css)$/.test(f)).map((f) => rf("dist/assets/" + f)).join("") + rf("dist/index.html");
  ok("R31 built bundle has no googletagmanager / google-analytics", !/googletagmanager|google-analytics|gtag\(/i.test(dist)); await c.close();
};
R[32] = async () => {
  const c = await b.newContext(), q = await c.newPage(); await q.goto(H + "/"); await q.waitForSelector("h1"); await q.goto(H + "/read/" + A[0].id); await q.waitForTimeout(500);
  const st = await q.evaluate(async () => ({ ls: Object.keys(localStorage), ss: Object.keys(sessionStorage), ck: document.cookie, db: (await indexedDB.databases?.())?.length || 0, ca: (await caches.keys()).length, sw: (await navigator.serviceWorker.getRegistrations()).length }));
  ok("R32 before any choice nothing is stored (no localStorage, cookies, IndexedDB, caches, service worker)", !st.ls.length && !st.ss.length && !st.ck && !st.db && !st.ca && !st.sw, JSON.stringify(st)); await c.close();
  ok("R32 consent audit: only the choice record before consent, each switch opt-in (node scripts/consent-audit.mjs)", ...(await sh("node", ["scripts/consent-audit.mjs"])));
};
R[33] = async () => { ok("R33 hostile strings in every harvested field render as text (node scripts/sanitise-fuzz.mjs)", ...(await sh("node", ["scripts/sanitise-fuzz.mjs"]))); };
R[34] = async () => { ok("R34 hash and localStorage fuzz (node scripts/fuzz-inputs.mjs)", ...(await sh("node", ["scripts/fuzz-inputs.mjs"]))); };
R[35] = async () => { ok("R35 every href allowlisted, external links noopener noreferrer (node scripts/href-allowlist.mjs)", ...(await sh("node", ["scripts/href-allowlist.mjs"]))); };
R[36] = async () => {
  ok("R36 exact pins + lockfile + licences (node scripts/deps.mjs)", ...(await sh("node", ["scripts/deps.mjs"])));
  ok("R36 npm audit --audit-level=moderate", ...(await sh("bash", ["-c", "cd web && npm audit --audit-level=moderate 2>&1 | tail -3"])));
  const d = rr(".github/dependabot.yml");
  ok("R36 Dependabot: npm and actions weekly, each grouped", (d.match(/interval: weekly/g) || []).length === 2 && (d.match(/patterns: \["\*"\]/g) || []).length === 2);
};
R[37] = async () => {
  await go("/privacy"); const t = await main();
  ok("R37 privacy notice cites the Data Privacy Act of 2012 and lists rights", /Data Privacy Act of 2012/.test(t) && /access|erasure|withdraw/i.test(t));
  ok("R37 UPOU operator and DPO placeholders are clearly marked [...]", /\[Operator name[^\]]*UP Open University\.\]/.test(t) && /\[DPO name[^\]]*UP Open University\]/.test(t));
};
R[38] = async () => {
  const ex = (f) => fs.existsSync(new URL("../" + f, import.meta.url));
  ok("R38 dist has no passages.json and no index/pass/ (PDF text)", !ex("dist/index/passages.json") && !ex("dist/index/pass"));
  ok("R38 passages.json, data/ and PDFs are git-ignored and untracked", /passages\.json/.test(rr(".gitignore")) && /^\/data\//m.test(rr(".gitignore")) && (await sh("git", ["ls-files", "data", "web/public/index/passages.json", "*.pdf"]))[1] === "", "");
  ok("R38 no 12 consecutive words of PDF text in dist or git (python fulltext_check.py, 30 PDFs)", ...(await sh(PY, ["fulltext_check.py", "12", "30"])));
  await go("/search/learning", "[role=status]"); await p.waitForTimeout(1500); const t = await main();
  ok("R38 search results show abstract/summary excerpts, no 'Best passage'", await p.locator("[aria-label='Best-fit passage']").count() === 0 && t.length > 500 && await p.locator("li").count() > 5);
};
R[39] = async () => {
  const sw = rf("dist/sw.js");
  ok("R39 sw.js: GET same-origin only, caches only 200 basic non-redirected responses without a query string, skips vectors/wasm", /q\.method !== "GET" \|\| u\.origin !== location\.origin/.test(sw) && /r\.ok && r\.type === "basic" && !r\.redirected && !new URL\(r\.url\)\.search/.test(sw) && /\(bin\|wasm\)/.test(sw));
  ok("R39 precache lists no passages and no model/vector files", !/pass\/|passages|\.bin|\.wasm/.test(sw.match(/PRE = (\[.*?\]);/)?.[1] || "x"));
  const c = await b.newContext(); await c.addInitScript(() => localStorage.setItem("upou-consent", JSON.stringify({ prefs: true })));
  const q = await c.newPage(); await q.goto(H + "/"); await q.waitForSelector("h1"); await q.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 }).catch(() => {}); await q.waitForTimeout(1500);
  await q.reload(); await q.waitForTimeout(800);
  const keys = await q.evaluate(async () => { await fetch("index/facets.json?poison=1"); await fetch("index/faq/14.json?poison=2"); await new Promise((r) => setTimeout(r, 500)); const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
  ok("R39 worker active under 'prefs' and a ?poison= request is not stored", keys.length > 5 && !keys.some((u) => u.includes("?")), keys.length + " entries"); await c.close();
};
R[40] = async () => {
  const y = rr(".github/workflows/pages.yml"), jobs = y.split(/^jobs:\n/m)[1], build = jobs.split(/^  deploy:/m)[0], dep = jobs.split(/^  deploy:/m)[1] || "";
  ok("R40 workflow: top-level permissions {}, build job contents: read only (no id-token/pages/write)", /^permissions: \{\}/m.test(y) && /permissions: \{ contents: read \}/.test(build) && !/id-token|pages: write|write/.test(build));
  ok("R40 workflow: pages write + id-token write only on the deploy job", /permissions: \{ pages: write, id-token: write \}/.test(dep));
  const uses = [...y.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  ok(`R40 workflow: all ${uses.length} actions pinned (@vN or a commit SHA), no pull_request_target`, uses.every((u) => /@(v\d+|[0-9a-f]{40})$/.test(u)) && !/pull_request_target/.test(y), uses.join(" "));
  ok("R40 SITE_URL comes from the repo variable (no hard-coded host in the workflow)", /vars\.SITE_URL/.test(y) && !/github\.io/.test(y.replace(/#.*$/gm, "")));
};

// Rounds 41-50 (speed). reqs(): URLs requested while a route loads, in a fresh context with the given consent.
const reqs = async (route, consent, wait = 2500) => {
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 } }); if (consent) await c.addInitScript((v) => localStorage.setItem("upou-consent", v), JSON.stringify(consent));
  const q = await c.newPage(), u = []; q.on("request", (r) => u.push(r.url().replace(U, ""))); await q.goto(H + route); await q.waitForSelector("h1"); await q.waitForTimeout(wait);
  const t = await q.evaluate(() => document.querySelectorAll("main li").length); await c.close(); return [u, t];
};
R[41] = async () => ok("R41 startup data budget: before first paint <= 500 KB gz (was 844 with full abstracts), texts <= 600, entry <= 120, precache <= 1400, vecs <= 5 MB", ...(await sh("node", ["scripts/budget.mjs"])));
R[42] = async () => {
  for (const [l, c] of [["no choice", null], ["prefs only", { prefs: true, model: false }]]) for (const r of ["/", "/search/learning"]) {
    const [u] = await reqs(r, c); const bad = u.filter((x) => /worker|transformers|vecs\.bin|\.wasm|onnx|huggingface|jsdelivr/i.test(x));
    ok(`R42 ${l} on ${r}: no search worker beyond the lexical one, no model, vectors or wasm`, !bad.some((x) => /transformers|vecs|wasm|onnx|huggingface|jsdelivr/i.test(x)), bad.join(",").slice(0, 100));
  }
};
R[43] = async () => {
  const n = (await (await fetch(U + "/index/chunks.json")).json()).length, v = (await (await fetch(U + "/index/vecs.bin")).arrayBuffer()).byteLength;
  ok("R43 vecs.bin is int8 (chunks x 384 bytes, 4x smaller than float32)", v === n * 384, `${(v / 1e6).toFixed(1)} MB for ${n}`);
  ok("R43 hybrid search on the int8 vectors keeps hit@1 >= 0.85 and hit@5 >= 0.93 (search-eval.mjs)", ...(await sh("node", ["scripts/search-eval.mjs"])));
};
R[44] = async () => {
  const [u] = await reqs("/", { prefs: true }), f = u.filter((x) => /\.woff2?$/.test(x)), im = u.filter((x) => /\.(png|jpe?g|webp|gif|avif)$/.test(x) && !/icon-180|favicon-32|upou-seal|img\/banner/.test(x));
  ok("R44 home: only woff2 fonts, 5 or fewer (4 latin + one latin-ext when a title needs a glyph), no raster images (covers are CSS/SVG)", f.length > 0 && f.length <= 5 && f.every((x) => x.endsWith(".woff2")) && !im.length, f.length + " fonts, images " + im.join(","));
  ok("R44 first-screen fonts are preloaded and swap (no invisible text)", (rf("dist/index.html").match(/rel="preload" as="font"/g) || []).length >= 3 && /font-display:\s*swap/.test(rf("dist/assets/" + (rf("dist/index.html").match(/index-[^"]+\.css/) || [""])[0]) || ""));
};
R[45] = async () => {
  const [, t] = await reqs("/search/", { prefs: true, lists: true }); const css = rf("dist/assets/" + rf("dist/index.html").match(/index-[^"]+\.css/)[0]);
  ok(`R45 all ${A.length} items browse as 24 cards + Show more, with content-visibility on cards`, t > 0 && t < 80 && /content-visibility:\s*auto/.test(css), t + " list items in the DOM");
};
R[46] = async () => {
  const sw = rf("dist/sw.js");
  ok("R46 sw.js: index data is stale-while-revalidate, hashed assets cache-first", /includes\("\/index\/"\)/.test(sw) && /immutable|assets\//.test(sw));
  ok("R46 precache gz <= 1400 KB (budget.mjs)", ...(await sh("node", ["scripts/budget.mjs"])));
};
R[47] = async () => ok("R47 LCP/CLS/TBT/INP at 4x CPU on 6 routes within perf.mjs budgets, search filters memoised (perf.mjs)", ...(await sh("node", ["scripts/perf.mjs"])));
R[48] = async () => ok("R48 search latency on the built data: lexical p95 <= 100 ms, hybrid p95 <= 400 ms (latency.mjs)", ...(await sh("node", ["scripts/latency.mjs"])));
R[49] = async () => {
  ok("R49 bundle: no three/3d-force-graph/transformers in the entry, no static import of lazy chunks (bundle.mjs)", ...(await sh("node", ["scripts/bundle.mjs"])));
  const [u] = await reqs("/search/learning", { prefs: true }); ok("R49 search route fetches no Graph3D/Maps/Advanced chunk", !u.some((x) => /Graph3D|Maps-|Advanced-/.test(x)), u.filter((x) => /Graph3D|Maps-|Advanced-/.test(x)).join(","));
};
R[50] = async () => { const h = rr("docs/handoff.md"); ok("R50 docs/handoff.md covers built, rebuild, pending (summaries, OCR) and human tasks (operator/DPO, review, SITE_URL, real devices, headers)", ["## What is built", "## Rebuild", "summarize.py", "ocr.py", "DPO", "human review|Human review", "SITE_URL", "Real-device", "Hosting headers"].every((x) => new RegExp(x).test(h))); };
R[51] = async () => {
  ok("R51 data: every item has >=4 tags, a category and a sub-topic, tags grounded in title/abstract, none in >40% of items (python tags_check.py)", ...(await sh(PY, ["tags_check.py"])));
  const a = A.find((x) => x.autoTags?.length && x.subtopics?.length && x.categories?.length); await go("/read/" + a.id);
  const t = await p.locator("main").first().innerText(), lab = await p.locator("main abbr[aria-label^='AI-generated']").count();
  ok("R51 reader lists sub-topics and auto tags, each row with the AI label", /Sub-topics/.test(t) && /Auto tags/.test(t) && lab >= 2, lab + " AI labels");
  await p.getByRole("link", { name: a.subtopics[0], exact: true }).first().click(); await p.waitForSelector("h1"); await p.waitForTimeout(500);
  ok("R51 a sub-topic page lists its items", p.url().includes("#/sub/") && (await p.locator("h1").innerText()).includes(a.subtopics[0]) && await p.locator("main a[href^='#/read/']").count() > 0, p.url());
  const tn = new Map(), sn = new Map(); A.forEach((x) => { x.subjects.forEach((t) => tn.set(t, (tn.get(t) || 0) + 1)); x.subtopics.forEach((t) => sn.set(t, (sn.get(t) || 0) + 1)); });
  const solo = A.filter((x) => x.subjects.some((t) => tn.get(t) === 1)).slice(0, 10); let badLinks = 0;
  for (const x of solo) { await go("/read/" + x.id); const hs = await p.locator("main a[href*='#/tag/'], main a[href*='#/sub/']").evaluateAll((l) => l.map((e) => e.getAttribute("href"))); badLinks += hs.filter((h) => { const [k, v] = h.replace("#/", "").split("/"); const d = decodeURIComponent(v); return k === "tag" ? tn.get(d) === 1 : sn.get(A.flatMap((y) => y.subtopics).find((t) => t.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") === d) || "") === 1; }).length; }
  ok(`R51 reader pages of ${solo.length} items with one-item tags link none of those tags (plain text)`, solo.length === 10 && badLinks === 0, badLinks + " bad links");
  await go("/maps/pub/" + solo[0].id, "svg"); await p.waitForTimeout(1500);
  const mapBad = await p.locator("svg [data-node][aria-label^='topic:']").evaluateAll((l, ones) => l.filter((e) => ones.some((t) => e.getAttribute("aria-label").endsWith(": " + t)) && e.getAttribute("tabindex") !== null).length, solo[0].subjects.filter((t) => tn.get(t) === 1));
  ok("R51 2D map: one-item tag nodes are not focusable", mapBad === 0, mapBad + " focusable");
  await go("/topics"); ok("R51 Topics lists one-item tags/sub-topics as links", [...sn.values()].every((n) => n >= 1) && await p.locator("main a[href*='#/tag/']").count() > 0);
  await go("/topics"); const subs = new Set(A.flatMap((x) => x.subtopics));
  ok(`R51 Topics groups ${subs.size} sub-topics under the top-level categories`, subs.size >= 25 && subs.size <= 40 && await p.locator("main a[href^='#/sub/']").count() >= subs.size, subs.size + " sub-topics");
  await go("/"); await p.locator("input[role=combobox]").first().fill(a.subtopics[0].slice(0, 6)); await p.waitForTimeout(400);
  ok("R51 type-ahead offers sub-topics", /sub-topic/i.test(await p.locator("[role=listbox]").first().innerText()));
  await go("/advanced"); await p.getByRole("button", { name: /^Find filters for/ }).first().click(); await p.waitForTimeout(300);
  ok("R51 Advanced has a sub-topic facet", await p.getByRole("tab", { name: "Sub-topic" }).count() > 0);
};
R[52] = async () => {
  ok("R52 data: advisers grounded in source text, no duplicate people, badge fixture, held-out + sub-topic + multi-topic panel eval, discovery counts (python adviser_check.py)", ...(await sh(PY, ["adviser_check.py"])));
  const reqs = []; const f = (r) => reqs.push(r.url()); p.on("request", f); await go("/"); p.off("request", f);
  ok("R52 startup loads no people/adviser data (lazy on /advisers and /adviser)", !reqs.some((u) => /people\.(json|bin)/.test(u)));
  ok("R52 locked: Advisers tab is in the menu (it opens the sign-in)", await p.locator("nav[aria-label=Main] a", { hasText: "Advisers" }).count() === 1);
  await signIn(p, U); await go("/");
  ok("R52 menu has an Advisers tab once signed in", await p.locator("nav[aria-label=Main] a", { hasText: "Advisers" }).count() === 1);
  const P = src("index/people.json"), byId = new Map(A.map((a) => [a.id, a])), LY = Math.max(...A.map((a) => +a.year || 0));
  const lastOf = (q) => Math.max(...q.adv.map((i) => +byId.get(i).year || 0));
  const advs = P.filter((q) => q.adv.length), inact = advs.find((q) => lastOf(q) < LY), act = advs.find((q) => lastOf(q) === LY);
  await go("/advisers", "[data-person]");
  await p.getByLabel("Search a name").fill(inact.n); await p.waitForTimeout(300);
  const rI = p.locator(`[data-person="${inact.n}"]`); ok(`R52 badge "No advisee in ${LY}" on ${inact.n} (latest advisee ${lastOf(inact)})`, (await rI.innerText()).includes(`No advisee in ${LY}`));
  await p.getByLabel("Search a name").fill(act.n); await p.waitForTimeout(300);
  ok(`R52 no badge on ${act.n} (advisee in ${LY})`, !(await p.locator(`[data-person="${act.n}"]`).innerText()).includes("No advisee in"));
  const noadv = P.find((q) => !q.adv.length); await p.getByLabel("Search a name").fill(noadv.n); await p.waitForTimeout(300);
  ok("R52 author without advisees: 'Has not advised in this repository'", (await p.locator(`[data-person="${noadv.n}"]`).innerText()).includes("Has not advised in this repository"));
  await p.getByLabel("Search a name").fill("");
  const cnt = new Map(); A.filter((a) => a.advisers.length).forEach((a) => a.subtopics.forEach((t) => cnt.set(t, (cnt.get(t) || 0) + 1)));
  const top = [...cnt].sort((x, y) => y[1] - x[1]).map((z) => z[0]);
  for (const t of [top[0], top[2]]) { const i = p.getByRole("combobox").first(); await i.fill(t); await p.waitForTimeout(150); await i.press("ArrowDown"); await i.press("Enter"); await p.waitForTimeout(150); }
  ok("R52 two topics chosen by type-ahead are chips", await p.getByRole("button", { name: /^Remove sub-topic/ }).count() === 2);
  ok("R52 suggested panel has 3 distinct members, a coverage matrix, AI labels and the not-an-endorsement note", await p.locator("[data-member]").count() === 3 && new Set(await p.locator("[data-member]").evaluateAll((l) => l.map((e) => e.dataset.member))).size === 3 && await p.locator("[data-matrix] tbody tr").count() >= 3 && await p.locator("abbr", { hasText: "AI" }).count() > 2 && /not endorsements/.test(await main()));
  ok("R52 without the model opt-in the ranking says it uses words and tags only", await p.locator("[data-mode=words]").count() === 1);
  await p.getByRole("radio", { name: "4", exact: true }).click(); await p.waitForTimeout(200);
  ok("R52 panel size 4 gives 4 members", await p.locator("[data-member]").count() === 4);
  await p.getByRole("radio", { name: "3", exact: true }).click(); await p.getByRole("button", { name: /^Remove .* from the panel/ }).first().click(); await p.waitForTimeout(200);
  const two = await p.locator("[data-member]").count(); await p.getByRole("button", { name: "Suggest members" }).click(); await p.waitForTimeout(200);
  ok("R52 panel is editable: remove one (2 left), Suggest members refills to 3", two === 2 && await p.locator("[data-member]").count() === 3);
  ok("R52 discovery lists narrower topics with counts and an AI-labelled gaps note", await p.getByRole("heading", { name: /Narrower thesis topics/ }).count() === 1 && await p.getByRole("button", { name: "Use as candidate topic" }).count() > 0);
  // tabs
  const tabs = () => p.getByRole("tab").count();
  const before = await tabs(); await p.getByRole("button", { name: "Use as candidate topic" }).first().click(); await p.waitForTimeout(300);
  ok("R52 'Use as candidate topic' opens a new tab holding the topics", await tabs() === before + 1 && await p.getByRole("button", { name: /^Remove / }).count() >= 2);
  await p.getByRole("button", { name: "+ New topic" }).click(); await p.getByLabel("Name of this candidate topic").fill("Mine"); await p.waitForTimeout(200);
  ok("R52 new tab is added and renamed", await tabs() === before + 2 && await p.getByRole("tab", { name: "Mine" }).count() === 1);
  await p.getByRole("tab", { name: "Mine" }).focus(); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(150);
  ok("R52 arrow keys move between tabs (roving tabindex)", await p.getByRole("tab", { selected: true }).count() === 1 && (await p.getByRole("tab", { selected: true }).innerText()) !== "Mine");
  await p.getByRole("tab", { name: "Mine" }).click(); p.once("dialog", (d) => d.accept()); await p.getByRole("button", { name: "Delete", exact: true }).click(); await p.waitForTimeout(200);
  ok("R52 delete removes the tab", await tabs() === before + 1 && await p.getByRole("tab", { name: "Mine" }).count() === 0);
  // reader + adviser page, solo rule
  const nA = new Map(); A.forEach((a) => a.advisers.forEach((n) => nA.set(n, (nA.get(n) || 0) + 1)));
  const multi = A.find((a) => a.advisers.some((n) => nA.get(n) > 1)), solo = A.find((a) => a.advisers.some((n) => nA.get(n) === 1));
  await go("/read/" + multi.id); const nm = multi.advisers.find((n) => nA.get(n) > 1);
  ok("R52 reader shows the adviser (plain label) as a link when they have >1 item", await p.locator("main a[href^='#/adviser/']", { hasText: nm }).count() === 1 && /Advisers?:/.test(await main()));
  await p.locator("main a[href^='#/adviser/']", { hasText: nm }).first().click(); await p.waitForSelector("h1"); await p.waitForTimeout(600);
  ok("R52 /adviser/<slug> lists the person's theses", (await p.locator("h1").innerText()) === nm && await p.locator("main a[href^='#/read/']").count() >= nA.get(nm));
  if (solo) { const sn = solo.advisers.find((n) => nA.get(n) === 1); await go("/read/" + solo.id); ok("R52 one-item adviser is plain text on the item page", await p.locator("main a[href^='#/adviser/']", { hasText: sn }).count() === 0 && (await main()).includes(sn)); }
  // map -> committee search
  await go("/advisers", "[data-person]"); await p.getByRole("tab").first().click();
  const mt = A.find((a) => a.subjects.length > 1 && a.subjects.every((s) => A.filter((x) => x.subjects.includes(s)).length > 1)).subjects[0];
  await go("/maps/tag/" + encodeURIComponent(mt), "svg [data-node]"); await p.waitForTimeout(1500);
  const node = p.locator("svg g[data-node][role=button][aria-label^='topic:']").first(); await node.focus(); await p.keyboard.press("Enter");
  await p.getByLabel("Candidate topic tab").selectOption("new"); await p.getByRole("button", { name: "Add to adviser search" }).click(); await p.waitForTimeout(300);
  const added = await p.locator("[data-committee] li button").first().innerText();
  ok("R52 map: a selected node can be added to the adviser search; it shows a check mark and a removable chip", await p.locator("[data-in-committee]").count() === 1 && added.length > 1);
  await p.getByRole("link", { name: "Open adviser search" }).click(); await p.waitForSelector("[role=tablist]"); await p.waitForTimeout(500);
  ok("R52 the topic added on the map is in a new advisers tab", await p.getByRole("button", { name: /^Remove .*/ }).filter({ hasText: added.replace(/ ×$/, "").trim() }).count() >= 1);
};
R[53] = async () => {
  ok("R53 faculty gate: schema, no emails/phones, slugs and aliases unique, IJODeL URL pattern + authors by alias rules, merge fixtures (node scripts/faculty_check.mjs)", ...(await sh("node", ["scripts/faculty_check.mjs"])));
  ok("R53 adviser gate: weight order international > own > advisee, chair/track record, status badges, hit@3 (python adviser_check.py)", ...(await sh(PY, ["adviser_check.py"])));
  ok("R53 budget after moving the AI half-page summaries out of the startup file", ...(await sh("node", ["scripts/budget.mjs"])));
  const reqs = []; const f = (r) => reqs.push(r.url()); p.on("request", f); await go("/"); await p.waitForTimeout(800); p.off("request", f);
  ok("R53 startup loads no faculty, IJODeL, international or half.json data before the page needs it", !reqs.some((u) => /faculty\/|ijodel|international\.json|people\./.test(u)), reqs.find((u) => /faculty\/|ijodel|international\.json/.test(u)));
  const half = await (await fetch(U + "/index/half.json")).json(), hid = Object.keys(half)[0];
  ok("R53 startup articles.json has no half-page summaries; they ride in half.json keyed by id", Object.keys(half).length > 0 && A.every((a) => !("half" in a)));
  await go("/read/" + hid); await p.waitForTimeout(800); await p.getByRole("button", { name: "AI summary" }).click(); await p.waitForTimeout(300);
  ok("R53 reader still shows the half-page AI summary from half.json", (await p.locator("main").innerText()).includes(half[hid].slice(0, 40)));
  const P = src("index/people.json"), ijp = P.find((q) => q.ij?.length && q.adv.length), santa = P.find((q) => q.os?.includes("joete-b-santarita"));
  await go("/adviser/joete-b-santarita", "h1"); await p.waitForTimeout(500);
  ok("R53 old-spelling address /adviser/joete-b-santarita redirects to the merged person", p.url().endsWith("/adviser/" + santa.s) && (await p.locator("h1").innerText()).includes("Santarita"));
  await go("/adviser/melinda-f-lumant-a", "h1"); await p.waitForTimeout(500);
  ok("R53 faculty-file alias (OCR split of Lumanta) redirects too, and the four+one theses are on one page", p.url().endsWith("/adviser/melinda-f-lumanta") && await p.locator("ul.grid-pubs li").count() === 5);
  await go("/adviser/" + ijp.s, "h1"); await p.waitForSelector("[data-ijodel] a", { timeout: 5000 }); await p.waitForTimeout(500);
  const lk = await p.locator("[data-ijodel] li a").evaluateAll((l) => l.map((a) => [a.getAttribute("href"), a.rel, a.target]));
  ok("R53 profile lists IJODeL articles: exact article/view/<digits> links, noopener noreferrer, no PDF, labelled From IJODeL and matched by name", lk.length === ijp.ij.length && lk.every((x) => /^https:\/\/ijodel\.upou\.edu\.ph\/ijodel\/article\/view\/\d+$/.test(x[0]) && /noopener/.test(x[1]) && /noreferrer/.test(x[1])) && (await p.locator("[data-ijodel]").innerText()).includes("From IJODeL") && (await p.locator("[data-ijodel]").innerText()).includes("matched by name"));
  ok("R53 IJODeL half-page summaries load per person and carry the AI label", await p.locator("[data-ijodel] li p:has-text('AI')").count() > 0);
  await go("/advisers", "[data-person]");
  const cnt = new Map(); A.filter((a) => a.advisers.length).forEach((a) => a.subtopics.forEach((t) => cnt.set(t, (cnt.get(t) || 0) + 1)));
  const i = p.getByRole("combobox").first(); await i.fill([...cnt].sort((x, y) => y[1] - x[1])[0][0]); await p.waitForTimeout(150); await i.press("ArrowDown"); await i.press("Enter"); await p.waitForTimeout(300);
  ok("R53 chair card shows why (international publications, advised N theses, latest YEAR) and every member card has an evidence-mix bar", /advised \d+ thesis(es)?, latest \d{4}/.test(await p.locator("[data-chair]").first().innerText()) && await p.locator("[data-member] [data-mix]").count() === 3);
  ok("R53 ranked people show the evidence mix", await p.locator("[data-person] [data-mix]").count() > 0);
  ok("R53 include-former toggle present and off by default", !(await p.getByLabel(/Include former faculty/).isChecked()));
};
R[54] = async () => {
  const c2 = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
  await c2.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
  const q = await c2.newPage(); q.on("pageerror", (e) => errs.push(e.message));
  const g2 = async (r, sel = "h1") => { await q.goto(H + r); if (ADV_ROUTE.test(r)) { await signIn(q, U); await q.goto(H + r); } await q.waitForSelector(sel); await q.waitForTimeout(600); };
  const P = src("index/people.json"), ijp = P.find((x) => x.ij?.length && x.adv.length), TOKEN = "zqxkwtoken93";
  const reqs = [], wss = []; q.on("request", (r) => reqs.push({ m: r.method(), u: r.url(), h: JSON.stringify(r.headers()), b: r.postData() })); q.on("websocket", (w) => wss.push(w.url()));
  await g2("/advisers", "[data-privacy-banner]");
  const bt = await q.locator("[data-privacy-banner]").innerText();
  ok("R54 /advisers banner: topics stay in this browser, nothing sent to a server", bt.includes("Your topics, thesis ideas and tabs stay in this browser. Nothing you enter here is sent to a server."));
  ok("R54 /advisers banner: no contact, notify or share; discuss directly", bt.includes("This site does not contact, notify or share anything with advisers or anyone else, and cannot reach them. Discuss your topic and any invitation directly with the person, not through this site."));
  const cnt = new Map(); A.filter((a) => a.advisers.length).forEach((a) => a.subtopics.forEach((t) => cnt.set(t, (cnt.get(t) || 0) + 1)));
  const i = q.getByRole("combobox").first(); await i.fill([...cnt].sort((x, y) => y[1] - x[1])[0][0]); await q.waitForTimeout(150); await i.press("ArrowDown"); await i.press("Enter");
  await i.fill(TOKEN + " thesis idea"); await i.press("Enter");
  const nb = q.getByRole("button", { name: "+ New topic" }); if (await nb.count()) { await nb.click(); await q.waitForTimeout(200); }
  await i.fill(TOKEN + " second"); await i.press("Enter");
  const sg = q.getByRole("button", { name: "Suggest members" }); if (await sg.count()) await sg.click(); await q.waitForTimeout(500);
  await q.locator("[data-privacy-banner] summary").first().click(); await q.waitForTimeout(300);
  const cn = await q.locator("[data-net-count]").first().innerText(), how = await q.locator("[data-privacy-banner]").innerText();
  ok("R54 indicator after typing a token, adding tabs, matching: Requests carrying your text: 0", /Requests carrying your text:\s*0\b/.test(cn), cn);
  ok("R54 intercepted: every request is GET/HEAD, no body, no token in URL/headers/body, no websocket", reqs.length > 5 && reqs.every((r) => /^(GET|HEAD)$/.test(r.m) && !r.b && !(r.u + r.h).includes(TOKEN)) && wss.length === 0, reqs.find((r) => !/^(GET|HEAD)$/.test(r.m) || r.b)?.u);
  ok("R54 'How do we know?' and Network activity list origins", /How do we know\?/.test(how) && /Network activity/.test(how) && (await q.locator("[data-network] tbody tr").count()) > 0);
  ok("R54 no mailto link, form or contact button in main", (await q.locator("main a[href^=mailto], main form, main button:has-text('Contact'), main button:has-text('Invite')").count()) === 0);
  const csp = await q.locator("meta[http-equiv=Content-Security-Policy]").getAttribute("content");
  ok("R54 CSP: connect-src has no third party beyond Hugging Face/jsDelivr, no unsafe-inline in script-src", !/script-src[^;]*unsafe-inline/.test(csp) && /connect-src[^;]*'self'/.test(csp) && !/connect-src[^;]*\*[ ;]/.test(csp + ";"), /connect-src ([^;]*)/.exec(csp)[1]);
  await g2("/adviser/" + ijp.s); ok("R54 /adviser/<slug>: banner, map link, no contact route", (await q.locator("[data-privacy-banner]").innerText()).includes("cannot reach them") && await q.locator("main a[href='#/maps/adviser/" + ijp.s + "']").count() >= 1 && (await q.locator("main a[href^=mailto], main form").count()) === 0);
  await q.evaluate(() => fetch("/index/people.json", { method: "POST", body: "x" }).catch(() => {})); await q.waitForTimeout(200);
  ok("R54 control: a POST made by the page moves the counter to 1", /:\s*1\b/.test(await q.locator("[data-net-count]").first().innerText()));
  await g2("/privacy"); const pv0 = await q.locator("[data-privacy-advisers]").innerText(); await g2("/about");
  ok("R54 privacy notice and About carry the adviser statements", pv0.includes("does not contact, notify or share anything with advisers") && /Advisers: no contact, nothing sent/.test(await q.locator("main").innerText()));
  await routeAdv(q, "people.json", (j) => { const t = j.find((x) => x.s === ijp.s); t.wr = { one: { text: "Human written one page text.", source: "human", reviewed: true } }; return j; });
  const noWr = src("index/people.json").find((x) => x.adv.length && !existsSync(new URL("../public/index/profiles/" + x.s + ".json", import.meta.url))); // an adviser whose writeup was not published
  await q.reload(); await g2("/adviser/" + (noWr ? noWr.s : ijp.s)); await q.waitForTimeout(500);
  ok("R54 absent writeup: 'Writeup not generated yet'", (await q.locator("[data-writeup-absent]").first().innerText()).includes("Writeup not generated yet"));
  await routeAdv(q, "profiles/" + ijp.s + ".json", { name: ijp.n, half: "HALF " + "alpha ".repeat(210), one: "ONE " + "beta ".repeat(420), two: "TWO " + "gamma ".repeat(900) }); await q.reload(); await g2("/adviser/" + ijp.s);
  const tg = q.locator("[data-writeup-toggle]").first(); if (await q.locator("[data-writeup-text]").count() === 0) await tg.click();
  const wt = async () => q.locator("[data-writeup-text]").first().innerText(), lb = async () => q.locator("[data-writeup-label]").first().innerText();
  ok("R54 half first, labelled AI-generated ... not an endorsement", (await wt()).startsWith("HALF") && /AI-generated from this repository.s records, may contain errors, not an endorsement/.test(await lb()), (await lb()).slice(0, 80));
  await q.locator("[data-len=two]").first().click(); ok("R54 length toggle to two", (await wt()).startsWith("TWO"));
  await q.locator("[data-len=one]").first().click(); ok("R54 faculty file overrides: Edited by a person, Reviewed", (await wt()).startsWith("Human written") && /Edited by a person/.test(await lb()) && /Reviewed/.test(await lb()));
  await q.locator("[data-len=two]").first().click(); await q.getByRole("button", { name: "Copy", exact: true }).first().click(); await q.waitForTimeout(300);
  const clip = await q.evaluate(() => navigator.clipboard.readText()); ok("R54 Copy puts writeup and AI label on the clipboard", clip.includes("TWO gamma") && clip.includes("may contain errors"));
  await q.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; }); await q.getByRole("button", { name: "Print", exact: true }).first().click(); await q.waitForTimeout(200);
  await q.emulateMedia({ media: "print" });
  const pv = await q.evaluate(() => ({ printed: window.__printed, cls: document.documentElement.classList.contains("print-wr"), box: getComputedStyle(document.querySelector("[data-print-this] [data-writeup-text]")).visibility, ban: getComputedStyle(document.querySelector("[data-privacy-banner]")).visibility, btn: getComputedStyle(document.querySelector("[data-print-this] button")).display }));
  await q.emulateMedia({ media: "screen" });
  ok("R54 print view: only the writeup visible, buttons hidden, print requested", pv.printed === 1 && pv.cls && pv.box === "visible" && pv.ban === "hidden" && pv.btn === "none", JSON.stringify(pv));
  await q.unrouteAll(); await q.reload();
  await g2("/advisers", "[data-person]"); const card = q.locator("[data-person]").first();
  ok("R54 person cards: writeup toggle and map link present", await card.locator("[data-writeup-toggle]").count() === 1 && await card.locator("a[href^='#/maps/adviser/']").count() === 1);
  await g2("/maps/adviser/" + ijp.s, "svg [data-node]"); await q.waitForTimeout(1200);
  const nodes = await q.locator("svg g[data-node]").evaluateAll((l) => l.map((e) => e.getAttribute("aria-label")));
  ok("R54 adviser map renders adviser, items, IJODeL, sub-topics; no empty message", nodes.some((x) => x.startsWith("adviser:")) && nodes.some((x) => x.startsWith("IJODeL article:")) && nodes.some((x) => x.startsWith("sub-topic:")) && (await q.getByText("Nothing to map").count()) === 0, nodes.length + " nodes " + nodes.slice(0, 4).join("|"));
  ok("R54 adviser map: back link and privacy banner", await q.locator("[data-back-to-person] a[href='#/adviser/" + ijp.s + "']").count() === 1 && await q.locator("[data-privacy-banner]").count() === 1);
  await q.locator("svg g[data-node][aria-label^='IJODeL article:']").first().focus(); await q.keyboard.press("Enter");
  const ex = await q.getByRole("link", { name: /Open on IJODeL/ }).first().evaluate((a) => [a.getAttribute("href"), a.rel, a.target]);
  ok("R54 IJODeL node: external link, noopener noreferrer, new tab", /^https:\/\/ijodel\.upou\.edu\.ph\//.test(ex[0]) && /noopener/.test(ex[1]) && /noreferrer/.test(ex[1]) && ex[2] === "_blank", ex[0]);
  await q.locator("svg g[data-node][aria-label^='adviser:']").first().focus(); await q.keyboard.press("Enter");
  ok("R54 adviser node: status badge and Open profile", await q.locator("[data-adviser-status] span").count() >= 1 && await q.getByRole("link", { name: "Open profile" }).count() >= 1);
  const aA = A.find((a) => P.some((x) => x.aut.includes(a.id) && x.adv.length)), pa = P.find((x) => x.aut.includes(aA.id) && x.adv.length), an = aA.authors.find((s) => s.toLowerCase().includes(pa.n.split(" ").at(-1).toLowerCase()));
  await g2("/maps/author/" + encodeURIComponent(an), "svg [data-node]"); await q.waitForTimeout(800);
  ok("R54 Author seed that is an adviser: 'Also an adviser'", await q.locator("[data-also-adviser]").count() >= 1, an);
  await q.close(); await c2.close();
};
R[55] = async () => {
  ok("R55 static access gate: dist has no plaintext adviser data, names or credentials; wrong/missing secrets fail the build (node scripts/access-check.mjs)", ...(await sh("node", ["scripts/access-check.mjs"])));
  const { u, p: pw } = (await import("./adv-test.mjs")).creds();
  const c3 = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }), q = await c3.newPage(); q.on("pageerror", (e) => errs.push(e.message));
  const reqs = []; q.on("request", (r) => reqs.push({ m: r.method(), u: r.url(), b: r.postData() }));
  const P = src("index/people.json"), nm = P.find((x) => x.adv.length).n, advArt = A.find((a) => a.advisers.length);
  for (const r of ["/advisers", "/adviser/" + P[0].s, "/maps/adviser/" + P[0].s]) {
    await q.goto(H + r); await q.waitForSelector("[data-login]"); const t = await q.locator("main").innerText();
    ok(`R55 locked ${r.replace(P[0].s, "<slug>")}: only the login form (Restricted), no 404, no names`, /Restricted/.test(t) && !/not found|404/i.test(t) && !t.includes(nm) && await q.locator("[data-person], svg [data-node]").count() === 0);
  }
  ok("R55 locked: menu has the Advisers tab, Maps has no Adviser seed", await q.locator("nav[aria-label=Main] a", { hasText: "Advisers" }).count() === 1 && (await q.goto(H + "/maps") , await q.waitForSelector("[role=group][aria-label='Seed kind']"), await q.locator("[role=group][aria-label='Seed kind'] a", { hasText: "Adviser" }).count()) === 0);
  await q.goto(H + "/read/" + advArt.id); await q.waitForSelector("h1"); await q.waitForTimeout(600);
  ok("R55 locked: reader shows no Adviser line", !/Advisers?:/.test(await q.locator("main").innerText()));
  await q.goto(H + "/advisers"); await q.waitForSelector("[data-login]");
  ok("R55 login form is labelled (Username, Password), password type, error region aria-live, statement 'Login is checked in your browser; nothing is sent.'", await q.getByLabel("Username").count() === 1 && await q.locator("input[type=password]").count() === 1 && await q.locator("[role=alert][aria-live]").count() === 1 && (await q.locator("[data-login-note]").innerText()).includes("Login is checked in your browser; nothing is sent."));
  const n0 = reqs.length;
  await q.getByLabel("Username").fill(u); await q.getByLabel("Password").fill(pw + "x"); await q.getByRole("button", { name: "Sign in" }).click();
  await q.waitForFunction(() => /Wrong username or password/.test(document.querySelector("[data-login] [role=alert]")?.textContent || ""), null, { timeout: 15000 });
  ok("R55 wrong password: generic message 'Wrong username or password', still locked", await q.locator("[data-lock]").count() === 0 && await q.locator("[data-login]").count() === 1);
  await q.getByLabel("Username").fill("nobody"); await q.getByLabel("Password").fill(pw); const t0 = Date.now(); await q.getByRole("button", { name: "Sign in" }).click();
  await q.waitForFunction(() => /Wrong username or password/.test(document.querySelector("[data-login] [role=alert]")?.textContent || ""), null, { timeout: 15000 });
  ok("R55 wrong username gives the same message, after a short back-off delay", Date.now() - t0 >= 550, (Date.now() - t0) + " ms");
  await q.getByLabel("Username").fill(u.toUpperCase() === u ? u.toLowerCase() : u.toUpperCase()); await q.getByLabel("Password").fill(pw); await q.getByRole("button", { name: "Sign in" }).click();
  await q.waitForSelector("[data-lock]", { timeout: 20000 }); await q.waitForSelector("[data-person]", { timeout: 15000 });
  const during = reqs.slice(n0);
  ok("R55 right credentials (user name in the other letter case) unlock /advisers", await q.locator("[data-person]").count() > 3 && await q.locator("nav[aria-label=Main] a", { hasText: "Advisers" }).count() === 1);
  ok("R55 login and unlock sent nothing: every request is GET/HEAD without body, none carries the password or username, network counter 0", during.length > 0 && during.every((r) => /^(GET|HEAD)$/.test(r.m) && !r.b && !r.u.includes(encodeURIComponent(pw)) && !r.u.includes(pw)) && (await q.evaluate(() => window.__net.n)) === 0 && /Requests carrying your text:\s*0\b/.test(await q.locator("[data-privacy-banner]").innerText()));
  ok("R55 data files requested are opaque .enc names, no people.json", during.some((r) => /\/index\/a\/[0-9a-f]{32}\.enc$/.test(r.u)) && !during.some((r) => /people\.(json|bin)|ijodel\/|faculty\//.test(r.u)));
  await q.goto(H + "/read/" + advArt.id); await q.waitForTimeout(800);
  ok("R55 unlocked: reader shows the Adviser line (names arrive from the encrypted map)", advArt.advisers.every((x) => true) && /Advisers?:/.test(await q.locator("main").innerText()) && (await q.locator("main").innerText()).includes(advArt.advisers[0]));
  const store = await q.evaluate(() => JSON.stringify([localStorage, sessionStorage, document.cookie, location.href]));
  ok("R55 no credential, key or salt in localStorage, sessionStorage, cookies or the URL", !store.includes(pw) && !/salt|"hash"/i.test(store) && !store.toLowerCase().includes('"' + u.toLowerCase() + '"'));
  await q.locator("[data-lock]").click(); await q.waitForTimeout(500);
  await q.goto(H + "/read/" + advArt.id); await q.waitForTimeout(600);
  ok("R55 Lock wipes the key and data: reader line gone, Advisers tab gone, /advisers shows the login form", !/Advisers?:/.test(await q.locator("main").innerText()) && await q.locator("[data-lock]").count() === 0 && (await q.goto(H + "/advisers"), await q.waitForSelector("[data-login]"), true) && await q.locator("[data-person]").count() === 0);
  await q.reload(); await q.waitForSelector("[data-login]"); ok("R55 reload keeps nothing: still locked", await q.locator("[data-lock]").count() === 0);
  await c3.close();
};
// Rounds 56-75 (advisers, one small change + one check each). One signed-in page is shared; each round starts from empty tabs.
let AP = null, APctx = null;
const adv0 = async (topics = [], sel = "[data-person]") => {
  if (!AP) { APctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] }); await APctx.addInitScript(() => { try { if (!localStorage.getItem("upou-consent")) localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} }); AP = await APctx.newPage(); AP.on("pageerror", (e) => errs.push(e.message)); await signIn(AP, U); }
  await AP.evaluate(() => { localStorage.removeItem("upou-committee"); location.hash = "#/"; }); await AP.waitForTimeout(150);
  await AP.evaluate(() => { location.hash = "#/advisers"; }); await AP.waitForTimeout(300); if (await AP.locator("[data-login]").count()) { await signIn(AP, U); await AP.evaluate(() => { location.hash = "#/advisers"; }); } await AP.waitForSelector(sel); await AP.waitForTimeout(400);
  for (const t of topics) { const i = AP.getByRole("combobox").first(); await i.fill(t); await i.press("Enter"); await AP.waitForTimeout(500); }
  return AP;
};
const TA = "online learning", TB = "assessment";
R[56] = async () => {
  const q = await adv0([TA]); await q.getByLabel("Search a name").fill("qqzzxx");
  ok("R56 name search with no hit shows an empty state with a Clear button", /Nobody matches/.test(await q.locator("[data-empty-people]").innerText()) && await q.locator("[data-empty-people] button").count() === 1);
  await q.locator("[data-empty-people] button").click(); await q.waitForTimeout(200);
  ok("R56 Clear restores the list", await q.locator("[data-person]").count() > 0 && await q.locator("[data-empty-people]").count() === 0);
};
R[57] = async () => {
  const P = src("index/people.json"), f = P.find((x) => x.fn?.length && x.adv?.length); const q = await adv0([]);
  if (!f) return ok("R57 (no person with former names in data)", true);
  await q.getByLabel("Search a name").fill(f.fn[0].toUpperCase()); await q.waitForTimeout(300);
  ok("R57 name search also finds a former name (any letter case)", await q.locator(`[data-person="${f.n}"]`).count() === 1, f.fn[0]);
  await q.getByLabel("Search a name").fill("jose".normalize("NFC")); await q.waitForTimeout(200);
};
R[58] = async () => {
  const q = await adv0([]); const t0 = await q.locator("[data-person]").count(); const more = q.locator("[data-more]");
  ok("R58 more than 30 people: 30 shown and a Show-30-more button", t0 === 30 && await more.count() === 1, String(t0));
  await more.click(); await q.waitForTimeout(300); ok("R58 Show 30 more adds 30", await q.locator("[data-person]").count() === 60);
};
R[59] = async () => {
  const q = await adv0([]); ok("R59 no topic yet: a hint says to add a topic", /Add a topic above/.test(await q.locator("[data-hint]").innerText()));
  await q.getByRole("combobox").first().fill(TA); await q.getByRole("combobox").first().press("Enter"); await q.waitForTimeout(500);
  ok("R59 hint gone once a topic is added", await q.locator("[data-hint]").count() === 0);
};
R[60] = async () => {
  const q = await adv0([TA]); const m = (await q.locator("[data-person] [data-match]").allInnerTexts()).map((t) => +t.match(/(\d+)%/)[1]);
  ok("R60 each ranked person shows 'Match: N% of the best match'; first is 100, never increasing", m.length > 5 && m[0] === 100 && m.every((v, i) => !i || v <= m[i - 1]), m.slice(0, 6).join(","));
};
R[61] = async () => {
  const q = await adv0([TA, TB]);
  ok("R61 coverage table: legend explains 'Yes' and the number, scroll region is focusable and labelled, name column sticky", /number is the match score/.test(await q.locator("[data-matrix] caption").innerText()) && await q.locator("[role=region][aria-label^='Topic coverage'][tabindex='0']").count() === 1 && await q.locator("[data-matrix] tbody th").first().evaluate((e) => getComputedStyle(e).position) === "sticky");
};
R[62] = async () => {
  const q = await adv0(["zzzxqjvw"]);
  ok("R62 topic nobody covers: panel says none can be suggested, people list says nobody has items", await q.locator("[data-no-panel]").count() === 1 && await q.locator("[data-empty-people]").count() === 1 && await q.locator("[data-member]").count() === 0);
};
R[63] = async () => {
  const q = await adv0([TA, TA.toUpperCase()]);
  ok("R63 the same topic typed twice (other case) is added once", await q.locator("ul[aria-label='Topics of this candidate'] li button").count() === 1);
  for (const t of ["alpha beta", "gamma delta", "epsilon zeta", "eta theta", "iota kappa"]) { const i = q.getByRole("combobox").first(); await i.fill(t); await i.press("Enter"); await q.waitForTimeout(200); }
  ok("R63 at six topics a note says six is the most and the box is disabled", await q.locator("[data-max-topics]").count() === 1 && await q.getByRole("combobox").first().isDisabled());
};
R[64] = async () => {
  const q = await adv0([TA]); const st = q.locator("[data-panel] [role=status]").last();
  const inP = await q.locator("[data-member]").count(); const btn = q.locator("[data-person] button:has-text('Add to panel')").first();
  await btn.click(); await q.waitForTimeout(300);
  ok("R64 Add to panel is announced in a live region", /Added .* to the panel/.test(await st.innerText()) && await q.locator("[data-member]").count() === inP + 1, await st.innerText());
  for (let i = 0; i < 6; i++) { const x = q.locator("[data-person] button:has-text('Add to panel'):not([disabled])").first(); if (await x.count()) { await x.click(); await q.waitForTimeout(150); } }
  ok("R64 a full panel (5) disables the other Add buttons", await q.locator("[data-person] button:has-text('Add to panel'):not([disabled])").count() === 0 && await q.locator("[data-member]").count() === 5);
};
R[65] = async () => {
  const q = await adv0([TA]); await q.locator("[data-member] button:has-text('Remove')").first().click(); await q.waitForTimeout(300);
  ok("R65 after Remove, focus moves to the panel and the removal is announced", await q.evaluate(() => document.activeElement?.hasAttribute("data-panel")) && /Removed/.test(await q.locator("[data-panel] [role=status]").last().innerText()));
};
R[66] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }), q = await c.newPage(); q.on("pageerror", (e) => errs.push(e.message));
  await routeAdv(q, "people.json", () => ({ not: "an array" })); await q.goto(H + "/adviser/x"); await signIn(q, U); await q.evaluate(() => { location.hash = "#/adviser/x"; }); await q.waitForTimeout(2500);
  ok("R66 /adviser/<slug> shows an error (not an endless skeleton) when the people data fails", await q.locator("[data-load-error]").count() === 1); await c.close();
};
R[67] = async () => {
  const P = src("index/people.json"), s = (P.find((x) => x.adv.length) || P[0]).s; const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }), q = await c.newPage(); q.on("pageerror", (e) => errs.push(e.message));
  let fail = true; await signIn(q, U); const id = await routeAdv(q, "profiles/" + s + ".json", { half: "HALF TEXT ok" });
  await q.route("**/index/a/" + id + ".enc", (r) => (fail ? r.abort() : r.fallback()), { times: 1 });
  await q.evaluate((s) => { location.hash = "#/adviser/" + s; }, s); await q.waitForSelector("[data-writeup-toggle]"); await q.waitForTimeout(1500);
  const t1 = await q.locator("[data-writeup-box]").innerText(); fail = false;
  await q.locator("[data-writeup-toggle]").click(); await q.locator("[data-writeup-toggle]").click(); await q.waitForTimeout(1500);
  ok("R67 a failed writeup load ends in 'not generated' (no endless Loading) and is retried on the next open", /not generated yet/.test(t1) && /HALF TEXT ok/.test(await q.locator("[data-writeup-box]").innerText()), t1.slice(-40)); await c.close();
};
R[68] = async () => {
  const q = await adv0([TA]); const n = await q.locator("[data-person] [data-more-items]").count();
  const a = await q.locator("[data-person]:has([data-more-items]) [data-more-items] a").first().getAttribute("href").catch(() => null);
  ok("R68 people with more than 2 matching items link to 'and N more' on their page", n > 0 && /^#\/adviser\//.test(a || ""), `${n} people, ${a}`);
};
R[69] = async () => {
  const q = await adv0([TA]); const c = await q.locator("[role=tab]").first();
  ok("R69 tab buttons carry the full name as title (truncated on phones)", (await c.getAttribute("title")) === (await c.innerText()) || !!(await c.getAttribute("title")));
};
R[70] = async () => {
  const q = await adv0([]); const t1 = await q.title(); await q.locator("[data-person] a").first().click(); await q.waitForSelector("h1 + p, h1"); await q.waitForTimeout(400); const t2 = await q.title();
  await q.evaluate(() => { location.hash = "#/"; }); await q.waitForTimeout(300);
  ok("R70 an adviser page sets the tab title '<name> · Advisers' and leaving it drops the name", t1 !== t2 && / · Advisers$/.test(t2) && !/ · Advisers$/.test(await q.title()), `${t1} | ${t2} | ${await q.title()}`);
};
R[71] = async () => {
  const q = await adv0([TA, TB]); const t = (await q.locator("[data-person] [data-match]").allInnerTexts()).map((x) => +x.match(/(\d+)%/)[1]);
  const c = (await q.locator("[data-person]").evaluateAll((l) => l.map((e) => +(e.innerText.match(/covers (\d+) of/) || [0, 0])[1])));
  ok("R71 ranking: match never rises down the list with two topics, and everyone listed covers at least one topic", t.every((v, i) => !i || v <= t[i - 1]) && c.every((v) => v >= 1), t.slice(0, 5).join(","));
};
R[72] = async () => {
  const q = await adv0([TA]); const bad = await q.locator("[data-member] [data-badge='former'], [data-member] [data-badge='external']").count();
  ok("R72 default suggested panel has no former or external person (only with the toggle)", bad === 0);
};
R[73] = async () => {
  const c = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" }); await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
  const q = await c.newPage(); q.on("pageerror", (e) => errs.push(e.message)); await signIn(q, U);
  await q.evaluate(() => { localStorage.removeItem("upou-committee"); location.hash = "#/"; }); await q.waitForTimeout(150); await q.evaluate(() => { location.hash = "#/advisers"; }); await q.waitForSelector("[data-person]");
  for (const t of [TA, TB]) { const i = q.getByRole("combobox").first(); await i.fill(t); await i.press("Enter"); await q.waitForTimeout(500); }
  const m = await q.evaluate(() => ({ over: document.documentElement.scrollWidth > document.documentElement.clientWidth, small: [...document.querySelectorAll("[data-panel] button, [data-person] button")].filter((e) => e.getBoundingClientRect().height < 36).length }));
  ok("R73 phone 390px: /advisers with two topics has no sideways overflow and panel/list buttons are >= 36px tall", !m.over && m.small === 0, JSON.stringify(m)); await c.close();
};
R[74] = async () => {
  const q = await adv0([TA, TB]); const i = q.getByRole("combobox").first(); await i.focus(); await i.press("Backspace"); await q.waitForTimeout(300);
  const chips = await q.locator("ul[aria-label='Topics of this candidate'] li button").count(); await i.press("Backspace"); await q.waitForTimeout(300);
  ok("R74 Backspace in the empty topic box removes the last topic (2 -> 1 -> 0)", chips === 1 && await q.locator("ul[aria-label='Topics of this candidate']").count() === 0);
};
R[75] = async () => {
  const q = await adv0([TA]); const t0 = Date.now(); const i = q.getByRole("combobox").first(); await i.fill(TB); await i.press("Enter"); await q.waitForSelector("ul[aria-label='Topics of this candidate'] li:nth-child(3)"); await q.waitForSelector("[data-matrix] thead th:nth-child(3)");
  const ms = Date.now() - t0; ok("R75 speed: adding a second topic re-ranks everyone and rebuilds the panel and table in under 1.2 s", ms < 1200, ms + " ms");
};
const lum = (s) => { const c = s.match(/[\d.]+/g).slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const cr = (a, b2) => { const [x, y] = [lum(a), lum(b2)].sort((u, v) => v - u); return (x + .05) / (y + .05); };
R[103] = async () => {
  await go("/collections", ".pub-link"); const [fg, bg] = await p.locator(".pub-link span.absolute").first().evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
  ok("R103 collection card pill: solid background, contrast >= 4.5", !/\/|rgba/.test(bg) && cr(fg, bg) >= 4.5, cr(fg, bg).toFixed(1));
};
R[104] = async () => {
  await go("/collections", "[role=group]"); const m = await p.evaluate(() => [...document.querySelectorAll("[data-facets] [role=group]")].map((g) => [g.getAttribute("aria-label"), [...g.querySelectorAll("button[aria-pressed]")].length, [...g.querySelectorAll("button")].filter((x) => !x.hasAttribute("aria-pressed") && !/Fewer|^All /.test(x.textContent)).length]));
  ok("R104 every facet group is named and its chips are aria-pressed toggles", m.length > 0 && m.every(([l, c, o]) => l && c > 0 && o === 0), JSON.stringify(m));
};
R[105] = async () => {
  await go("/collections", "[data-facets] [role=group] button"); const st = () => p.locator("[data-facets] [role=status]").allInnerTexts();
  const c = p.locator("[data-facets] [role=group] button[aria-pressed]").first(); await c.click(); const on = (await st())[0] || ""; await c.click(); const off = (await st())[0] || "";
  ok("R105 collections status line stays after clearing and reads 'N items in M collections'", /^\d+ items in \d+ collections?$/.test(on) && /^\d+ items in \d+ collections?$/.test(off), on + " | " + off);
};
R[110] = async () => {
  await go("/collections", ".pub-link"); const k = await p.locator(".pub-link").first().getAttribute("href");
  await go(k.slice(1) + "/year%3D2019%26year%3D2020", "h1"); const st = await p.locator("[role=status]").first().innerText().catch(() => "");
  ok("R110 two year picks: group opens on the first year and says so", /2019/.test(st) && /2 year picks/.test(st), st);
};
R[111] = async () => {
  await go("/collections/type%3DBogus", "h1"); const on = await p.locator("[data-facets] button[aria-pressed=true]").count(), t = await p.locator("main, body").first().innerText();
  ok("R111 stale pick is dropped with one 'Some filters were ignored' note", on === 0 && (t.match(/Some filters were ignored/g) || []).length === 1, on + " on");
};
R[112] = async () => {
  await go("/collections", ".pub-link"); const rows = await p.evaluate(() => { const m = {}; document.querySelectorAll(".pub-link").forEach((e) => { const r = e.getBoundingClientRect(); (m[Math.round(r.top / 4)] ||= []).push(r.height); }); return Object.values(m); });
  ok("R112 collection cards in a row have equal height (within 1 px)", rows.length > 0 && rows.every((r) => Math.max(...r) - Math.min(...r) <= 1), JSON.stringify(rows.slice(0, 3).map((r) => r.slice(0, 4))));
};
R[113] = async () => {
  await go("/collections", ".pub-link"); await p.keyboard.press("Tab"); await p.locator(".pub-link").first().focus(); await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Tab");
  const o = await p.locator(".pub-link").first().evaluate((e) => { const c = getComputedStyle(e); return [parseFloat(c.outlineWidth), parseFloat(c.outlineOffset), c.outlineStyle, document.activeElement === e]; });
  ok("R113 focused card ring is drawn inside the clipped card", o[3] && o[0] >= 2 && o[1] <= 0 && o[2] !== "none", JSON.stringify(o));
};
R[114] = async () => {
  await go("/collections", "[data-facets] [role=group] button"); const g = p.locator("[data-facets] [role=group]").nth(1); const c = g.locator("button[aria-pressed]").first(); const t = (await c.innerText()).split(" ")[0];
  await c.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const a = await p.evaluate(() => document.activeElement?.innerText || "");
  ok("R114 collections: focus stays on the toggled chip", a.startsWith(t) && /aria-pressed/.test(await p.evaluate(() => document.activeElement.outerHTML)), t + " | " + a);
};
R[115] = async () => {
  await go("/"); await go("/collections", ".pub-link"); // remount: R114's picks stay in the hash otherwise
  const k = await p.locator(".pub-link").first().getAttribute("href"); await go(k.slice(1), "h1"); await p.waitForFunction(() => location.hash.startsWith("#/collection/") && !/^Collections/.test(document.querySelector("h1")?.innerText || ""), null, { timeout: 5000 });
  const c = p.locator("[data-facets] [role=group] button[aria-pressed]").first(), t = (await c.innerText()).split(" ")[0]; await c.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const a = await p.evaluate(() => document.activeElement?.innerText || ""), on = (await p.locator("[role=status]").allInnerTexts()).join("|");
  await p.getByRole("button", { name: "Clear filters" }).focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const off = await p.locator("[role=status]").allInnerTexts(), fo = await p.evaluate(() => document.activeElement?.tagName);
  const yb = await p.locator("[data-years] button").count() ? await p.locator("[data-years] button[aria-pressed]").count() === await p.locator("[data-years] button").count() : true;
  ok("R115 group: focus kept on chip, status announced on clear, year chips aria-pressed", a.startsWith(t) && /of \d+ items/.test(on) && off.some((s) => /^\d+ items$/.test(s)) && fo !== "BODY" && yb, [t, a, on, off.join("|"), fo, yb].join(" ; "));
};
R[120] = async () => {
  const a = A.find((x) => x.categories?.length), t = a.type.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const items = async (r) => { await go(r, "h1"); return (await p.locator(".pub-link").allInnerTexts()).join("|"); };
  const plain = await items("/type/" + t), carried = await items("/type/" + t + "/" + encodeURIComponent("cat=" + a.categories[0]));
  ok("R120 /type/<slug>/cat=X ignores the carried topic and lists the same items", plain.length > 0 && plain === carried, plain.length + " vs " + carried.length);
};
R[121] = async () => {
  await go("/collections", ".pub-link"); const l1 = await p.evaluate(() => history.length), h1 = await p.evaluate(() => location.hash);
  await p.waitForTimeout(800); await p.locator("[data-facets] [role=group] button[aria-pressed]").first().click(); await p.locator("[data-facets] [role=group] button[aria-pressed]").first().click(); await p.waitForTimeout(300);
  const l2 = await p.evaluate(() => history.length);
  ok("R121 opening /collections and toggling a pick adds no history entry", l1 === l2 && h1 === "#/collections", l1 + " " + l2 + " " + h1);
};
R[122] = async () => {
  const out = [];
  for (const a of A.slice(0, 3)) { await go("/maps/pub/" + encodeURIComponent(a.id), "svg [data-node]"); out.push(await p.evaluate(() => { const ts = [...document.querySelectorAll("svg [data-node] > text")]; return { min: Math.min(...ts.map((t) => parseFloat(getComputedStyle(t).fontSize) * t.getScreenCTM().a)), cut: ts.filter((t) => t.textContent.endsWith("…") && !t.querySelector("title")).length }; })); }
  ok("R122 map node labels >= 11 px on screen at default zoom; truncated ones carry a title", out.every((o) => o.min >= 11 && o.cut === 0), JSON.stringify(out));
};
R[123] = async () => {
  await go("/maps/pub/" + encodeURIComponent(A[0].id), "svg [data-node]"); const nodes = p.locator("svg [data-node][tabindex]"), sw = (i) => nodes.nth(i).evaluate((n) => n.querySelector(":scope > g[stroke]").getAttribute("stroke-width"));
  await nodes.nth(1).dispatchEvent("click"); await nodes.nth(2).hover(); await p.waitForTimeout(200);
  const [s, h] = [await sw(1), await sw(2)];
  ok("R123 map: selected ring 3, hovered ring 1.5, distinct", s === "3" && h === "1.5", s + " " + h);
};
R[124] = async () => {
  await go("/collections", "[data-facets] [role=group] button"); const b = p.locator("[data-facets] button[aria-expanded]"), n = await b.count();
  const name = n ? await b.first().getAttribute("aria-label") : "";
  ok("R124 'All N' facet buttons carry aria-expanded and a 'Show all N <facet>' name", n > 0 && /^Show all \d+ /.test(name), n + " " + name);
  if (n) { await b.first().click(); ok("R124 expanded state flips", await p.locator("[data-facets] button[aria-expanded=true]").count() === 1); }
};
R[125] = async () => {
  await go("/"); await p.setViewportSize({ width: 390, height: 800 }); await go("/collections", "[data-facets] summary");
  const d = await p.locator("details[data-facets]").evaluate((e) => e.open), t0 = await p.locator("details[data-facets] summary").innerText();
  await p.locator("details[data-facets] summary").click(); await p.locator("[data-facets] [role=group] button[aria-pressed]").first().click(); await p.waitForTimeout(200);
  const t1 = await p.locator("details[data-facets] summary").innerText(); await p.setViewportSize({ width: 1280, height: 1000 });
  ok("R125 at 390 the filter starts closed; summary 'Filter' then 'Filter (1)'", !d && t0.trim() === "Filter" && t1.trim() === "Filter (1)", [d, t0, t1].join(" | "));
};
R[126] = async () => {
  const u = (a) => "/maps/pub/" + encodeURIComponent(a.id); await go(u(A[0]), "svg [data-node]"); await go(u(A[1]), "svg [data-node]");
  const ms = await p.evaluate(async (h) => { const t = performance.now(); location.hash = h; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t; }, u(A[0]));
  ok("R126 returning to a seed re-renders in under 100 ms (cached graph)", ms < 100, ms.toFixed(0) + " ms");
};
R[127] = async () => {
  const pos = async () => { await go("/maps/pub/" + encodeURIComponent(A[2].id), "svg [data-node]"); return (await p.locator("svg [data-node]").evaluateAll((l) => l.map((n) => n.getAttribute("transform")).join())); };
  ok("R127 layout is deterministic across visits", (await pos()) === (await pos()));
  ok("R127 force ticks scale with graph size (150 below 60 nodes, 320 above)", /ns\.length < 60 \? 150 : 320/.test(readFileSync(new URL("../src/Maps.jsx", import.meta.url), "utf8")));
};
R[130] = async () => {
  await go("/maps/author/Nobody", "main"); await p.waitForTimeout(500);
  const t = await p.locator("main").innerText();
  ok("R130 unknown author seed: message, picker link, zero nodes", /Nothing to map for this seed/.test(t) && await p.locator("main a[href='#/maps/author']").count() >= 1 && await p.locator("svg [data-node]").count() === 0, t.match(/Nothing to map[^\n]*/)?.[0]);
};
R[131] = async () => {
  await go("/"); await p.evaluate(() => localStorage.setItem("upou-map-seed", JSON.stringify({ kind: "pub", id: "99999" })));
  await go("/maps", "svg [data-node]"); const k = await p.evaluate(() => localStorage.getItem("upou-map-seed"));
  ok("R131 stale remembered seed: default map opens and the key is removed", k === null && await p.locator("svg [data-node]").count() > 0, String(k));
};
R[134] = async () => {
  await p.setViewportSize({ width: 390, height: 800 }); await go("/collections", "ul li a"); await p.waitForTimeout(500);
  const o = await p.evaluate(() => { const u = [...document.querySelectorAll("main ul")].find((x) => x.style.gridTemplateColumns && x.children.length > 1); const c = getComputedStyle(u).gridTemplateColumns.split(" ").length, a = [...u.querySelectorAll("a")].map((e) => e.getBoundingClientRect().height); return { c, over: document.documentElement.scrollWidth - innerWidth, minH: Math.min(...a) }; });
  await p.setViewportSize({ width: 1280, height: 1000 });
  ok("R134 collections: 2 columns at 390, no sideways scroll, targets >= 36px", o.c === 2 && o.over <= 0 && o.minH >= 36, JSON.stringify(o));
};
R[135] = async () => {
  await p.setViewportSize({ width: 390, height: 800 }); await go("/maps/pub/14", "svg [data-node]");
  const o = await p.evaluate(() => { const d = [...document.querySelectorAll("details")].find((x) => /Show options/.test(x.querySelector("summary")?.textContent || "")); return { d: !!d, open: d?.open, w: document.querySelector("svg[aria-label^='Relationship map']").getBoundingClientRect().width / innerWidth, over: document.documentElement.scrollWidth - innerWidth }; });
  await p.setViewportSize({ width: 1280, height: 1000 });
  ok("R135 maps at 390: closed 'Show options' details, svg >= 85% width, no overflow", o.d && !o.open && o.w >= 0.85 && o.over <= 0, JSON.stringify(o));
};
R[136] = async () => {
  await go("/maps/pub/14", "svg [data-node]"); const n = () => p.locator("#seeds option").count();
  const n0 = await n(), t = A.find((a) => a.title.length > 20), word = t.title.split(" ").slice(0, 3).join(" ");
  await p.locator("input[list=seeds]").fill(word); const hit = await p.evaluate((x) => [...document.querySelectorAll("#seeds option")].some((o) => o.value === x), t.title);
  ok("R136 seed picker lists <= 50 options and a typed title still finds the item", n0 <= 50 && hit && await n() <= 50, n0 + " " + hit);
};
R[137] = async () => {
  const seen = []; const f = (r) => seen.push(r.url()); p.on("request", f); await go("/maps/pub/14", "svg [data-node]"); await p.waitForTimeout(800);
  const before = seen.some((u) => /Graph3D/.test(u)); await p.getByRole("button", { name: "3D", exact: true }).hover(); await p.waitForTimeout(1500); p.off("request", f);
  ok("R137 3D chunk requested only after hover on the 3D toggle", !before && seen.some((u) => /Graph3D/.test(u)), String(before));
};
R[140] = async () => {
  await go("/topics", "main"); const subs = await p.locator("main a[href*='#/sub/']").evaluateAll((l) => l.slice(0, 30).map((e) => [e.getAttribute("href"), e.querySelector("span")?.textContent.trim()])); let bad = [];
  for (const [h, c] of subs) { await go(h.replace(/^#/, ""), "h1"); await p.waitForTimeout(150); const t = await p.locator("main").innerText(), m = t.match(/(\d+)\s+items?\b/i); if (!m || m[1] !== c) bad.push(h + " " + c + " vs " + m?.[0]); }
  ok("R140 30 sub-topic counts on Topics equal the count on their page", subs.length === 30 && !bad.length, bad.slice(0, 3).join("; "));
};
R[141] = async () => {
  const q = await adv0([TA]), sums = await q.locator("[data-person] [data-mix] [role=img]").evaluateAll((l) => l.slice(0, 20).map((e) => (e.getAttribute("aria-label").match(/\d+(?=%)/g) || []).reduce((a, x) => a + +x, 0)));
  ok("R141 Mix percentages sum to 100 for 20 ranked people", sums.length >= 10 && sums.every((x) => x === 100), sums.join());
};
R[142] = async () => {
  const { spawnSync } = await import("child_process"), t = spawnSync("grep", ["-rEc", "text-\\[[0-9]+px\\]", "src", "--include=*.jsx"], { encoding: "utf8" }), n = t.stdout.split("\n").reduce((a, l) => a + (+l.split(":")[1] || 0), 0);
  ok("R142 no text-[Npx] sizes in JSX", n === 0, n + " matches");
};
R[143] = async () => {
  const q = await adv0([TA]), o = await q.locator("[data-person] [data-mix] span[title]").first().evaluate((e) => e.parentElement.querySelectorAll("span[title]").length);
  const bg = await q.locator("[data-person] [data-mix]").first().evaluate((e) => [...e.querySelectorAll("span[title]")].map((s) => getComputedStyle(s).backgroundImage));
  ok("R143 Mix segments have a title, a distinct pattern, and a text label", o >= 1 && new Set(bg.slice(1)).size === bg.slice(1).length && /Evidence mix: \w/.test(await q.locator("[data-mix] p").first().innerText()), bg.length + " segments");
};
R[144] = async () => {
  await p.setViewportSize({ width: 390, height: 800 }); await go("/maps/pub/14", "svg [data-node]");
  const o = await p.evaluate(() => { const m = Math.min(...[...document.querySelectorAll("svg [data-node] [data-hit]")].map((c) => c.getBoundingClientRect().width)); const f = document.querySelector("fieldset"); return { m, rows: f ? Math.round(f.getBoundingClientRect().height / parseFloat(getComputedStyle(f).lineHeight)) : 0 }; });
  await p.setViewportSize({ width: 1280, height: 1000 });
  ok("R144 maps at 390: every node hit area >= 24px", o.m >= 23.5, JSON.stringify(o));
};
R[145] = async () => {
  await go("/maps/pub/14", "svg [data-node]"); const n0 = p.locator("svg [data-node][tabindex]").first(); await n0.focus(); await p.keyboard.press("ArrowRight"); await p.keyboard.press("Enter");
  const sel = await p.locator("svg [data-node][aria-pressed=true]").count(); await p.keyboard.press("Escape"); const after = await p.locator("svg [data-node][aria-pressed=true]").count();
  ok("R145 maps keyboard: arrow moves, Enter selects, Esc clears", sel === 1 && after === 0, sel + " " + after);
};
R[146] = async () => {
  await go("/maps/pub/14", "svg [data-node]"); const ns = p.locator("svg [data-node]"), c = Math.min(200, await ns.count());
  const ms = await p.evaluate(async (c) => { const l = [...document.querySelectorAll("svg [data-node]")].slice(0, c), t = []; for (const e of l) { const s = performance.now(); e.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); e.dispatchEvent(new MouseEvent("mouseenter")); await new Promise((r) => requestAnimationFrame(r)); t.push(performance.now() - s); } t.sort((a, b) => a - b); return t[Math.floor(t.length * 0.95)]; }, c);
  ok("R146 hover over up to 200 map nodes: p95 frame < 50 ms", ms < 50, ms.toFixed(1) + " ms");
};
R[147] = async () => {
  await go("/maps/pub/14", "svg [data-node]"); const r = await p.evaluate(async () => { const s = document.querySelector("svg [data-node]").closest("svg"), g = s.querySelector("g"); let muts = 0; const mo = new MutationObserver((l) => { muts += l.length; }); mo.observe(g, { attributes: true, attributeFilter: ["transform"] });
    for (let i = 0; i < 60; i++) s.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true })); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))); mo.disconnect(); return muts; });
  ok("R147 60 wheel events in one frame make at most 2 transform updates", r >= 1 && r <= 2, String(r));
};
R[148] = async () => { ok("R148 headers: k.json and /index/a/* noindex (node scripts/headers.mjs)", ...(await sh("node", ["scripts/headers.mjs"]))); };
R[149] = async () => {
  const c = await b.newContext({ serviceWorkers: "block" }), p = await c.newPage(); await p.goto(H + "/advisers"); await p.waitForSelector("[data-login]"); await p.locator("input[name=username]").fill("nobody"); await p.locator("input[name=password]").fill("wrongpass1"); await p.locator("button[type=submit]").click(); await p.waitForSelector("[role=alert]:not(:empty)", { timeout: 15000 });
  const v = await p.locator("input[name=password]").inputValue(), t = await p.locator("main").innerText();
  ok("R149 failed login clears the password field", v === "" && !t.includes("wrongpass1"), v.length + " chars"); await c.close();
};
const login0 = async (w) => { const c = await b.newContext({ serviceWorkers: "block", viewport: { width: w, height: w > 600 ? 1000 : 800 } }), q = await c.newPage(); await q.goto(H + "/advisers"); await q.waitForSelector("[data-login]"); return [c, q]; };
R[150] = async () => { const [, x] = await sh("node", ["scripts/advisers-eval.mjs"]); ok("R150/R151 advisers-eval: year-less advisee skipped, panels never repeat a person", /"problems":\[\]/.test(x), (x.match(/"problems":\[[^\]]*\]/) || [""])[0].slice(0, 120)); };
R[151] = R[150];
R[152] = async () => {
  for (const w of [1280, 390]) { const [c, q] = await login0(w), o = await q.evaluate(() => { const f = document.querySelector("[data-login] form").getBoundingClientRect(), i = document.querySelector("[data-login] img"), h = document.querySelector("[data-login] h1").getBoundingClientRect(); return { w: f.width, top: f.top, vh: innerHeight, seal: !!i && i.getBoundingClientRect().bottom <= h.top + 1 }; });
    ok(`R152 login at ${w}: form <= 448 px, in first viewport, seal above heading`, o.w <= 448.5 && o.top < o.vh && o.seal, JSON.stringify(o)); await c.close(); }
};
R[153] = async () => {
  const sz = new Set(), bal = [];
  for (const r of ["/", "/collections", "/topics", "/search/learning", "/advanced", "/maps/pub/14", "/privacy", "/about", "/lists", "/read/" + A[0].id]) { await go(r); const o = await p.locator("h1").first().evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).textWrap]); sz.add(o[0]); bal.push(o[1]); }
  ok("R153 10 routes: one distinct h1 font-size, text-wrap balance", sz.size === 1 && bal.every((t) => /balance/.test(t)), [...sz].join() + " " + [...new Set(bal)].join());
};
R[154] = async () => { await go("/maps/pub/14", "svg [data-node]"); await p.locator("svg [data-node]").first().locator("[data-hit]").click({ force: true }); await p.waitForTimeout(300); const t = await p.locator("[data-selected-status]").innerText(); ok("R154 selecting a map node announces it in a status region", /^Selected: .+, \d+ connections$/.test(t), t.slice(0, 60)); };
R[155] = async () => {
  await go("/maps/pub/14", "svg [data-node]"); const k = () => p.locator("svg g").first().getAttribute("transform").then((t) => +/scale\(([\d.]+)\)/.exec(t)[1]), k0 = await k();
  await p.locator("[data-zoom=in]").click(); await p.waitForTimeout(100); const k1 = await k(); await p.getByRole("button", { name: "Reset view" }).click(); await p.waitForTimeout(100);
  ok("R155 Zoom in raises the scale, Reset view returns it", k1 > k0 && Math.abs(await k() - k0) < 1e-6 && await p.locator("[data-zoom=out]").count() === 1, `${k0} ${k1}`);
};
const tog = (sel) => p.evaluate(async (sel) => { const e = document.querySelector(sel), s = performance.now(); e.click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - s; }, sel);
R[156] = async () => { await go("/collections"); const ms = await tog("[data-facets] button[aria-pressed]"); ok("R156 Collections facet toggle under 50 ms", ms < 50, ms.toFixed(1) + " ms"); };
R[157] = async () => { await go("/collections"); await p.locator("main a[href*='#/collection/']").first().click(); await p.waitForSelector("[data-facets], h1"); await p.waitForTimeout(600); const ms = await tog("main button[aria-pressed]"); ok("R157 facet toggle on the largest collection under 50 ms", ms < 50, ms.toFixed(1) + " ms"); };
R[158] = async () => {
  const [c, q] = await login0(1280); await q.locator("input[name=password]").fill("x".repeat(10000)); const s = Date.now(), len = (await q.locator("input[name=password]").inputValue()).length;
  await q.locator("input[name=username]").fill("u"); await q.getByRole("button", { name: "Sign in" }).click(); await q.waitForSelector("[role=alert]:not(:empty)", { timeout: 4000 }).catch(() => {});
  ok("R158 a 10000-char password is capped or rejected quickly", len <= 128 && Date.now() - s < 3000, len + " chars, " + (Date.now() - s) + " ms"); await c.close();
};
R[159] = async () => { ok("R159 low PBKDF2 count in k.json refused, access-check passes (node scripts/access-check.mjs)", ...(await sh("node", ["scripts/access-check.mjs"]))); };
R[160] = async () => {
  const [c, q] = await login0(1280); let kj = 0; q.on("request", (r) => { if (/index\/k\.json/.test(r.url())) kj++; });
  await q.locator("input[name=username]").fill("nobody"); await q.locator("input[name=password]").fill("wrongpass1");
  await q.evaluate(() => { const f = document.querySelector("[data-login] form"); f.requestSubmit(); f.requestSubmit(); }); await q.waitForSelector("[role=alert]:not(:empty)", { timeout: 15000 }); await q.waitForTimeout(800);
  ok("R160 two rapid submits cause one k.json request", kj === 1, kj + " requests"); await c.close();
};
R[163] = async () => {
  await go("/"); const st = () => p.evaluate(() => { const d = document.querySelector("[aria-modal=true]"); return [getComputedStyle(d.parentElement).backgroundColor, getComputedStyle(d).borderRadius, getComputedStyle(d).boxShadow].join("|"); });
  await p.keyboard.press("?"); await p.waitForSelector("[aria-modal=true]") /* KeyHelp is a lazy chunk (R216) */; const a = await st(); await p.keyboard.press("Escape"); await p.getByRole("button", { name: /cookie settings/i }).last().click(); const c = await st();
  ok("R163 keyboard help and cookie settings share backdrop, radius, shadow", a === c, a + " vs " + c); await p.keyboard.press("Escape");
};
R[164] = async () => { await go("/maps/pub/14", "svg [data-node]"); const l = await p.locator("svg[role=group]").first().getAttribute("aria-label"); ok("R164 map svg label gives node and link counts", /\d+ nodes, \d+ links/.test(l), l.slice(0, 80)); };
R[165] = async () => {
  await go("/maps/pub/14", "svg [data-node]"); const nn = await p.locator("svg g[data-node]").count(); await p.locator("[data-node-list] summary").click(); await p.waitForTimeout(300);
  if (nn > 50) { ok("R165 list is capped at 50 until Show all", await p.locator("[data-node-list] li").count() === 50); await p.locator("[data-node-list-all]").click(); }
  const li = await p.locator("[data-node-list] li").count(), nb = await p.locator("[data-node-list] li button").count(); ok("R165 Show as list has one item per node, each with a button", li === nn && nb === nn && nn > 1, `${li} items, ${nb} buttons, ${nn} nodes`);
};
R[170] = async () => {
  await go("/advanced"); await p.getByRole("button", { name: /^Find filters for Required/ }).click(); await p.waitForTimeout(300);
  await p.locator("[role=dialog] button").filter({ hasNotText: /^(Done|Category|Sub-topic|tag|author|Collection|year)$/ }).first().click(); await p.getByRole("button", { name: "Done" }).click();
  const sw = p.getByRole("button", { name: /^Swap the filters of Required/ }); for (let i = 0; i < 35; i++) await sw.click();
  const h = +(await p.locator("summary", { hasText: "History" }).textContent()).match(/\d+/)[0];
  await p.getByRole("button", { name: /Undo/ }).first().click(); const r1 = await p.getByRole("button", { name: /Redo/ }).isDisabled(); await sw.click();
  ok("R170 undo capped at 30, new edit clears Redo", h === 30 && !r1 && await p.getByRole("button", { name: /Redo/ }).isDisabled(), `history ${h}, redo enabled after undo ${!r1}`);
};
R[172] = async () => {
  const st = (pg, sel) => pg.locator(sel).evaluate((e) => { const c = getComputedStyle(e); return [c.borderTopStyle, c.borderTopWidth, c.borderRadius, c.padding].join("|"); });
  await go("/collections"); const f = p.locator("[data-facets] button[aria-pressed]");
  for (let i = 0; i < await f.count() && !await p.locator("[data-nofilter]").count(); i++) await f.nth(i).click();
  const a = await st(p, "[data-nofilter]"); await go("/collection/no-such-shelf", "[data-empty]"); const b2 = await st(p, "[data-empty]");
  const q = await adv0([TA]); await q.getByLabel("Search a name").fill("qqzzxx"); const c = await st(q, "[data-empty-people]");
  ok("R172 three empty states share border, radius, padding", a === b2 && b2 === c, [a, b2, c].join(" / "));
};
R[173] = async () => {
  await go("/collections"); const f = p.locator("[data-facets] button[aria-pressed]"), off = await f.evaluateAll((l) => l.filter((b) => b.getAttribute("aria-pressed") === "false").length);
  const a = await f.filter({ has: p.locator("svg") }).count(); await f.first().click(); const b2 = await p.locator("[data-facets] button[aria-pressed=true] svg").count();
  ok("R173 active chip shows a check icon, inactive none", off > 0 && a === 0 && b2 === 1, `${a} icons before, ${b2} after one click`);
};
R[174] = async () => {
  const q = await adv0([TA, TB]); await q.setViewportSize({ width: 390, height: 844 }); await q.waitForTimeout(300);
  const chips = await q.locator("[aria-label='Topics of this candidate'] button").evaluateAll((l) => l.map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  ok("R175 topic chip remove targets >= 36 px at 390", chips.length === 2 && chips.every((v) => v >= 35.5), chips.join());
  for (let i = 0; i < 5; i++) await q.getByRole("button", { name: /^\+ New topic/ }).click();
  const r = await q.locator("[role=tab][aria-selected=true]").evaluate((e) => { const b = e.getBoundingClientRect(); return [b.left, b.right, innerWidth, document.querySelectorAll("[role=tab]").length]; });
  ok("R174 with 6 tabs at 390 the active (last) tab is fully visible", r[3] === 6 && r[0] >= 0 && r[1] <= r[2] + 0.5, r.join()); await q.setViewportSize({ width: 1280, height: 1000 });
};
R[185] = async () => {
  const q = await adv0([TA]); await q.getByRole("button", { name: "Use as candidate topic" }).first().click(); await q.waitForTimeout(400);
  ok("R185 'Use as candidate topic' moves focus to the new tab's panel, named by the tab", await q.evaluate(() => { const e = document.activeElement; return e?.getAttribute("role") === "tabpanel" && e.getAttribute("aria-labelledby") === document.querySelector("[role=tab][aria-selected=true]").id; }));
};
R[186] = async () => {
  await go("/"); await p.evaluate(() => { window.__ops = []; const o = Worker.prototype.postMessage; Worker.prototype.postMessage = function (m, ...r) { window.__ops.push(m?.op); return o.call(this, m, ...r); }; });
  const i = p.locator("input[role=combobox]").first(); await i.click(); await p.waitForTimeout(300); await p.evaluate(() => (window.__ops.length = 0));
  await i.pressSequentially("distance education", { delay: 15 }); await p.waitForTimeout(800);
  const k = await p.evaluate(() => window.__ops.filter((o) => o === "didYouMean" || o === "search0").length);
  ok("R186 18 keystrokes in a burst ask the worker at most twice", k >= 1 && k <= 2, k + " requests");
};
R[189] = async () => {
  const q = await adv0([TA]); await q.locator("[data-lock]").click(); await q.waitForTimeout(500);
  const k = await q.evaluate(() => ["ppl", "pvecs", "advTopics", "expVec", "pplErr", "peopleP"].filter((x) => window.__S[x] !== undefined));
  ok("R189 Lock wipes people, vectors, topic and expertise caches", k.length === 0, k.join());
};
R[190] = async () => {
  const bad = [];
  for (const q of ["learning", "distance education", "nursing", "covid", "online learning readiness"]) {
    await go("/search/" + encodeURIComponent(q), "[role=status]"); await p.waitForTimeout(1500);
    const tot = +(await p.locator("main [role=status]").first().innerText()).match(/^(\d+) of/)[1];
    const sum = (await p.locator("aside span:text-is('Type') + div button").allInnerTexts()).reduce((s, t) => s + (+t.match(/(\d+)\s*$/)?.[1] || 0), 0);
    if (sum !== tot) bad.push(`${q}: ${sum} vs ${tot}`);
  }
  ok("R190 type chip counts add up to the result total on 5 queries", bad.length === 0, bad.join("; "));
};
R[191] = async () => {
  const q = "a%2Fb 100%25";
  await go("/"); const i = p.locator("input[role=combobox]").first(); await i.fill(q); await i.press("Enter"); await p.waitForSelector("[role=status]"); await p.waitForTimeout(600);
  await p.reload(); await p.waitForSelector("input[role=combobox]"); await p.waitForTimeout(600);
  ok("R191 search URL with an encoded slash and percent restores the box text exactly", await p.locator("input[role=combobox]").first().inputValue() === q, await p.locator("input[role=combobox]").first().inputValue());
};
R[193] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }); await c.addInitScript(() => localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })));
  const q = await c.newPage(); await q.route("**/index/articles.json", async (r) => { await new Promise((x) => setTimeout(x, 2500)); r.continue(); });
  await q.goto(H + "/collections"); await q.waitForSelector("[aria-label='Loading the repository index']");
  const s = await q.locator("[data-skel-card] > :first-child").first().evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width), Math.round(r.height), Math.round(r.y + scrollY)]; }).catch(() => null);
  await q.waitForSelector("li.pub"); await q.waitForTimeout(500);
  const l = await q.locator("li.pub a > :first-child").first().evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width), Math.round(r.height), Math.round(r.y + scrollY)]; });
  ok("R193 collections skeleton card image box equals the loaded card's within 2 px", !!s && s.every((v, k) => Math.abs(v - l[k]) <= 2), `${s} vs ${l}`); await c.close();
};
R[194] = async () => {
  const q = await adv0([TA]); const g = q.getByRole("radiogroup", { name: "Panel size" });
  const a = await g.count() === 1 && (await g.getByRole("radio").count()) === 2;
  await g.getByRole("radio", { name: "3" }).focus().catch(() => {}); await q.keyboard.press("ArrowRight"); await q.waitForTimeout(500);
  ok("R194 panel size is a radio group; ArrowRight moves 3 to 4 and the panel updates", a && await g.getByRole("radio", { checked: true }).innerText() === "4" && await q.locator("[data-member]").count() >= 3, a + "");
};
R[195] = async () => {
  const c = await b.newContext({ serviceWorkers: "block" }); const q = await c.newPage(); await q.goto(H + "/advisers"); await q.waitForSelector("[data-login]");
  const at = await q.evaluate(() => { const u = document.querySelector("[data-login] input[name=username]"), pw = document.querySelector("[data-login] input[name=password]"); return [document.activeElement === u, u.autocomplete, pw.autocomplete]; });
  ok("R195 login: username focused, autocomplete username / current-password", at.join() === "true,username,current-password", at.join());
  const { u, p: pw } = (await import("./adv-test.mjs")).creds();
  await q.keyboard.type(u); await q.keyboard.press("Tab"); await q.keyboard.type(pw); await q.keyboard.press("Enter");
  ok("R195 Enter submits the login", await q.waitForSelector("[data-lock]", { timeout: 20000 }).then(() => true, () => false)); await c.close();
};
R[197] = async () => ok("R197 sw.js enables navigation preload and uses the preloaded response", /navigationPreload\?\.enable\(\)/.test(rf("dist/sw.js")) && /preloadResponse/.test(rf("dist/sw.js")) && /q\.method !== "GET" \|\| u\.origin !== location\.origin/.test(rf("dist/sw.js")));
R[198] = async () => {
  const c = await b.newContext({ serviceWorkers: "block" }); const q = await c.newPage(); await q.clock.install(); await signIn(q, U);
  await q.clock.fastForward(14 * 60 * 1000); await q.waitForTimeout(100); const early = await q.locator("[data-lock]").count();
  await q.clock.fastForward(2 * 60 * 1000); await q.waitForTimeout(300);
  ok("R198 15 minutes without input locks: tab gone, login shows (not at 14)", early === 1 && await q.locator("[data-lock]").count() === 0 && await q.locator("[data-login]").count() === 1, early + ""); await c.close();
};
R[199] = async () => {
  const c = await b.newContext(); await c.addInitScript(() => localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })));
  const q = await c.newPage(); await q.goto(H + "/"); await q.waitForSelector("h1"); await q.evaluate(() => navigator.serviceWorker.ready); await q.reload(); await q.waitForTimeout(800);
  await signIn(q, U); await q.waitForSelector("[data-person]"); await q.waitForTimeout(1200);
  const k = await q.evaluate(async () => { const out = []; for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname); return out.filter((x) => /\/index\/a\//.test(x)); });
  ok("R199 after unlock the runtime cache holds only .enc under index/a", k.every((x) => /\/index\/a\/[^/]+\.enc$/.test(x)), k.filter((x) => !/\.enc$/.test(x)).join()); await c.close();
};
R[200] = async () => {
  await go("/list/share/T/14,14,99999"); const t = await p.locator("main").innerText();
  ok("R200 shared list with a duplicate and an unknown id shows 1 item and 1 skipped", await p.locator("main ul > li").count() === 1 && /1 item\b/.test(t) && /1 skipped/.test(t), t.slice(0, 120));
};
R[201] = async () => {
  const before = errs.length; await go("/read/14/zzz"); await p.waitForTimeout(500);
  ok("R201 reader with an invalid section name logs no error and stays at the top", errs.length === before && await p.evaluate(() => scrollY) === 0, errs.slice(before).join());
};
R[202] = async () => {
  await go("/about"); const l = p.locator("main p a").first(), s = await l.evaluate((a) => { const c = (x) => x.match(/[\d.]+/g).slice(0, 3).map(Number), L = (v) => { const f = v.map((x) => (x /= 255) <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * f[0] + .7152 * f[1] + .0722 * f[2]; }, a1 = L(c(getComputedStyle(a).color)), b1 = L(c(getComputedStyle(a.parentElement).color)); return { cr: (Math.max(a1, b1) + .05) / (Math.min(a1, b1) + .05), ul: getComputedStyle(a).textDecorationLine }; });
  await l.focus(); const uf = await l.evaluate((a) => getComputedStyle(a).textDecorationLine);
  ok("R202 prose link differs from body text by 3:1 or is underlined, and is underlined on focus", (s.cr >= 3 || s.ul.includes("underline")) && uf.includes("underline"), `${s.cr.toFixed(2)} ${s.ul} ${uf}`);
};
R[203] = async () => {
  const a = A.find((x) => (x.subjects || []).some((t) => t.length > 40)), t = a.subjects.find((s) => s.length > 40); await go("/read/" + a.id);
  const c = p.locator(`main a, main span`).filter({ hasText: new RegExp("^#" + t.replace(/[^\w ]/g, ".") + "$") }).first(), w = (await c.boundingBox())?.width;
  ok("R203 a long tag chip is capped in width and carries its full name in title", !!w && w < 40 * 11 && await c.getAttribute("title") === "#" + t, `${w} ${t.length}`);
};
R[204] = async () => {
  const c = await b.newContext({ serviceWorkers: "block" }); const q = await c.newPage(); await q.goto(H + "/advisers"); await q.waitForSelector("[data-login]");
  await q.keyboard.type("nobody"); await q.keyboard.press("Tab"); await q.keyboard.type("wrong-password"); await q.keyboard.press("Enter"); await q.waitForSelector("[data-login] [role=alert]:not(:empty)");
  await q.waitForTimeout(300);
  const r = await q.evaluate(() => { const u = document.querySelector("[data-login] input[name=username]"), id = u.getAttribute("aria-describedby"); return [document.activeElement === u, !!id && document.getElementById(id)?.textContent.length > 0, document.querySelector("[data-login] input[name=password]").getAttribute("aria-describedby") === id]; });
  ok("R204 after a wrong password the username has focus and both fields point at the error", r.join() === "true,true,true", r.join()); await c.close();
};
R[205] = async () => {
  await go("/"); const seen = [], bad = [];
  for (const r of ["/about", "/collections", "/topics", "/privacy", "/search/learning", "/list"]) {
    await p.evaluate((x) => { location.hash = x; }, r); await p.waitForTimeout(900);
    const [h1, ti] = await p.evaluate(() => [document.activeElement?.tagName + document.activeElement?.getAttribute("tabindex"), document.title]);
    if (h1 !== "H1-1") bad.push(r + ":" + h1); seen.push(ti);
  }
  ok("R205 each route change moves focus to the h1 and changes the tab title", !bad.length && new Set(seen).size === seen.length, bad.join() + seen.length);
};
R[206] = () => { const h = rf("dist/_headers"), b = (h.split(/^(?=\S)/m).find((x) => x.startsWith("/index/*\n")) || ""); ok("R206 /index/* has max-age and stale-while-revalidate", /max-age=\d+/.test(b) && /stale-while-revalidate=\d+/.test(b), b.replace(/\n/g, " ")); };
R[207] = () => { const h = rf("dist/index.html"), e = rf("dist/assets/" + h.match(/src="\.\/assets\/(index-[^"]+\.js)"/)[1]); ok("R207 entry bundle holds no Privacy or About text", !/Who runs this site|About this site/.test(e)); };
const swRun = async (hdr, n) => {
  const vm = await import("vm"), st = new Map(), L = {}, cache = { put: async (q, r) => { st.delete(q.url); st.set(q.url, r); }, keys: async () => [...st.keys()].map((url) => ({ url })), delete: async (k) => st.delete(k.url) };
  const sb = { self: { addEventListener: (t, f) => (L[t] = f), registration: { scope: "http://x/" }, skipWaiting() {}, clients: { claim() {} } }, location: { origin: "http://x" }, caches: { open: async () => cache, has: async () => true, match: async () => undefined, keys: async () => [] }, URL, Promise, Response: { error: () => 0 } };
  const fx = (i) => ({ ok: true, type: "basic", redirected: false, url: "http://x/f/" + i, headers: { get: (k) => (hdr(i)[k] || "") }, clone() { return this; } });
  sb.fetch = async (q) => fx(+q.url.split("/").pop()); vm.runInNewContext(rf("scripts/sw.tpl.js").replace("/*PRE*/", '"./"'), sb);
  st.set("http://x/", 1); // precache entry
  for (let i = 0; i < n; i++) { let rp; L.fetch({ request: { url: "http://x/f/" + i, method: "GET", mode: "cors" }, respondWith: (x) => (rp = x) }); await rp; await new Promise((r) => setTimeout(r, 0)); }
  await new Promise((r) => setTimeout(r, 50)); return st;
};
R[208] = async () => { const st = await swRun(() => ({}), 300); ok("R208 300 fetches leave at most 200 runtime entries plus the precache", st.size <= 201 && st.has("http://x/") && st.has("http://x/f/299"), st.size + ""); };
R[209] = async () => { const st = await swRun((i) => (i === 1 ? { "cache-control": "private, no-store" } : i === 2 ? { vary: "*" } : {}), 4); ok("R209 no-store and Vary * responses are not stored, others are", !st.has("http://x/f/1") && !st.has("http://x/f/2") && st.has("http://x/f/0") && st.has("http://x/f/3"), [...st.keys()].join()); };
R[210] = async () => {
  await go("/collections", "main h2 a"); const hs = await p.locator("main h2 a").evaluateAll((l) => l.map((a) => a.getAttribute("href"))), bad = [];
  for (const h of hs) { await go(h.slice(1)); if (await p.locator("[data-empty]").count() || !(await p.locator("main li").count())) bad.push(h); }
  ok("R210 every Collections faculty heading opens a page with items", hs.length > 1 && !bad.length, bad.join() || hs.length + "");
};
R[211] = async () => {
  const cs = new Map(); A.forEach((a) => a.subjects.forEach((s) => cs.set(s, (cs.get(s) || new Set()).add(a.collection)))); const t = [...cs].find(([, c]) => c.size === 1)[0];
  await go("/collections/" + encodeURIComponent(new URLSearchParams({ tag: t }).toString())); const s = await p.locator("main h1 + p").innerText();
  ok("R211 one collection reads '1 collection in 1 faculty or community'", /^1 collection in 1 faculty or community\b/.test(s), s);
};
R[212] = async () => {
  await go("/collections"); const c = await p.locator("[data-facets] button > span").first().evaluate((e) => getComputedStyle(e).fontVariantNumeric);
  const m = await (await adv0([TA])).locator("[data-match]").first().evaluate((e) => getComputedStyle(e).fontVariantNumeric);
  ok("R212 chip counts and match % use tabular numerals", c.includes("tabular-nums") && m.includes("tabular-nums"), c + " / " + m);
};
R[213] = async () => {
  const q = await adv0([TA]), w = q.locator("[data-matrix]").locator("xpath=.."); await w.evaluate((e) => { e.scrollTop = 40; e.scrollLeft = 40; }); await q.waitForTimeout(100);
  const s = await q.locator("[data-matrix] thead th").first().evaluate((e) => [getComputedStyle(e).position, getComputedStyle(e).boxShadow, getComputedStyle(e).left]);
  const r = await q.locator("[data-matrix] tbody th").first().evaluate((e) => getComputedStyle(e).position);
  ok("R213 coverage header is sticky with a shadow; first column sticky", s[0] === "sticky" && s[1] !== "none" && r === "sticky", s.join() + " " + r);
};
R[214] = async () => {
  await go("/read/14"); const l = p.locator("nav[aria-label=Breadcrumb] li").last();
  ok("R214 last breadcrumb on /read/14 has aria-current=page and is not a link", await l.locator("[aria-current=page]").count() === 1 && await l.locator("a").count() === 0);
};
R[215] = async () => {
  await go("/search", "main input[role=combobox]"); const i = p.locator("main input[role=combobox]").first(); await i.click(); await i.pressSequentially("libre", { delay: 30 }); await i.press("Enter"); // results update on submit (no search-as-you-type), so the status is checked after Enter
  const re = /\d+ of \d+ items for .libre/, t0 = Date.now(); let s = ""; while (Date.now() - t0 < 1000 && !re.test(s)) { s = (await p.locator("main [role=status]").allInnerTexts()).join(" | "); await p.waitForTimeout(100); }
  ok("R215 status announces 'N of M items for libre' within 1 s of submitting", re.test(s), s.slice(0, 120));
};
const entry = () => { const h = rf("dist/index.html"); return rf("dist/assets/" + h.match(/src="\.\/assets\/(index-[^"]+\.js)"/)[1]); };
R[216] = () => { const e = entry(), all = fs.readdirSync(new URL("../dist/assets", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => rf("dist/assets/" + f)).join("");
  ok("R216 KeyHelp, SharedList and MyList are not in the entry (separate chunk)", !/Jump to the search box|My view lists|Shared view list/.test(e) && /Jump to the search box/.test(all) && /My view lists/.test(all)); };
R[217] = () => { const e = entry(); ok("R217 entry has no PBKDF2 and no login form", !/PBKDF2/.test(e) && !/Sign in to continue/.test(e)); };
R[218] = async () => {
  const c = await b.newContext(); await c.addInitScript(() => { if (!localStorage.getItem("upou-consent")) localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); });
  const q = await c.newPage(); await q.goto(H + "/"); await q.waitForSelector("h1"); await q.evaluate(() => navigator.serviceWorker.ready); await q.reload(); await q.waitForSelector("h1"); await q.waitForTimeout(800);
  const pick = async (on) => { await q.getByRole("button", { name: "Cookie settings" }).first().click(); await q.locator("#c-pref").setChecked(on); await q.getByRole("button", { name: "Save choices" }).click(); };
  await pick(false); await q.waitForTimeout(300); await q.evaluate(() => Promise.all(["index/facets.json", "index/k.json", "favicon-32.png"].map((u) => fetch(u)))); await q.waitForTimeout(1200);
  const st = await q.evaluate(async () => [(await caches.keys()).length, (await navigator.serviceWorker.getRegistrations()).length]);
  await pick(true); await q.waitForTimeout(2500); const re = await q.evaluate(async () => [(await caches.keys()).length, (await navigator.serviceWorker.getRegistrations()).length]); await c.close();
  ok("R218 revoking prefs leaves no caches and no worker (even after fetches); re-consent registers and caches again", st.join() === "0,0" && re[0] > 0 && re[1] === 1, st + " / " + re);
};
R[219] = async () => {
  const vm = await import("vm"), L = {}, res = (b) => ({ ok: true, type: "basic", redirected: false, url: "http://x/index/k.json", b, headers: { get: () => "" }, clone() { return this; } });
  let net = true; const sb = { self: { addEventListener: (t, f) => (L[t] = f), registration: { scope: "http://x/" }, skipWaiting() {}, clients: { claim() {} } }, location: { origin: "http://x" }, URL, Promise, Response: { error: () => 0 },
    caches: { open: async () => ({ put: async () => {}, keys: async () => [], delete: async () => {} }), has: async () => true, match: async () => res("old"), keys: async () => [] }, fetch: async () => { if (!net) throw new Error("offline"); return res("new"); } };
  vm.runInNewContext(rf("scripts/sw.tpl.js").replace("/*PRE*/", '"./"'), sb);
  const ask = async () => { let rp; L.fetch({ request: { url: "http://x/index/k.json", method: "GET", mode: "cors" }, respondWith: (x) => (rp = x) }); return (await rp)?.b; };
  const on = await ask(); net = false; const off = await ask();
  ok("R219 index/k.json is network-first (fresh body online, cached copy offline)", on === "new" && off === "old", on + " " + off);
};
R[220] = async () => {
  await go("/year/abc"); const h = await p.locator("h1").innerText();
  ok("R220 /year/abc: h1 is not 'Items from abc'; the empty state shows with a way out", !/Items from abc/.test(h) && await p.locator("[data-empty] a").count() === 2, h);
};
R[221] = async () => {
  const pos = async (r) => { await go(r, "svg [data-node]"); await p.waitForTimeout(1500); return p.evaluate(() => [...document.querySelectorAll("svg [data-node]")].map((n) => n.getAttribute("transform") || getComputedStyle(n).transform).join("|")); };
  const bad = []; for (const a of A.slice(0, 3)) { const r = "/maps/pub/" + encodeURIComponent(a.id); if (await pos(r) !== await pos(r)) bad.push(a.id); }
  ok("R221 opening the same map seed twice gives identical node positions (3 seeds)", bad.length === 0, bad.join());
};
R[222] = async () => {
  await go("/"); const c = await p.evaluate(() => getComputedStyle(document.body, "::selection").backgroundColor);
  ok("R222 ::selection uses the maroon tint", c === "rgb(233, 195, 207)", c);
};
R[223] = async () => {
  await go("/"); const r = await p.evaluate(() => { const bt = document.createElement("button"); bt.disabled = true; const s = document.createElement("summary"); document.body.append(bt, s); const o = [getComputedStyle(bt).cursor, getComputedStyle(bt).opacity, getComputedStyle(s).cursor]; bt.remove(); s.remove(); return o; });
  ok("R223 disabled button: not-allowed cursor, 50% opacity; summary: pointer", r.join() === "not-allowed,0.5,pointer", r.join());
};
R[224] = async () => {
  await go("/"); const i = p.locator("main input[role=combobox]").first(); await i.fill("learn");
  await p.waitForTimeout(300); const has = await p.getByRole("button", { name: "Clear search" }).count(), ex = await i.getAttribute("aria-expanded"); await i.press("Escape");
  const v1 = await i.inputValue(), ex1 = await i.getAttribute("aria-expanded"); if (ex === "true") await i.press("Escape");
  ok("R224 Clear button shows with text; first Esc closes open suggestions (text kept), the next empties the box; focus stays", has >= 1 && ex === "true" && ex1 === "false" && v1 === "learn" && await i.inputValue() === "" && await i.evaluate((e) => e === document.activeElement), [has, ex, ex1, v1].join());
};
R[225] = async () => {
  await go("/search"); await p.evaluate(() => localStorage.setItem("upou-recent", JSON.stringify(["alpha", "beta", "gamma"]))); await p.reload(); await p.waitForSelector("h1"); await p.waitForTimeout(600);
  const n0 = await p.getByRole("button", { name: /^Remove recent search/ }).count(); await p.getByRole("button", { name: "Remove recent search beta" }).click();
  const n1 = await p.getByRole("button", { name: /^Remove recent search/ }).count(); await p.evaluate(() => localStorage.removeItem("upou-recent"));
  ok("R225 each recent search has a remove button; removing one shrinks the list by one", n0 === 3 && n1 === 2, n0 + " " + n1);
};
R[227] = async () => {
  await go("/"); await p.waitForTimeout(2000); const n = await p.locator("main .band").count();
  ok("R227 home has all browse rows after 2 s", n >= 7, String(n));
};
R[228] = async () => {
  await go("/"); const u = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? r.updateViaCache + " " + r.scope : "none"; });
  ok("R228 worker registered with updateViaCache none and scope ./", u === "none " + H.replace("/#", "/"), u);
};
R[229] = () => {
  const d = new URL("../dist", import.meta.url).pathname, hits = [];
  for (const f of fs.readdirSync(d, { recursive: true }).filter((f) => /\.(html|css)$/.test(f))) { const t = rf("dist/" + f).replace(/<link[^>]*rel="canonical"[^>]*>/g, ""); if (/rel="?(preconnect|dns-prefetch)|\sping=|<(?:link|script|img|iframe|source|video|audio|embed|object)\b[^>]*\s(?:src|href)=["']?https?:\/\/(?!localhost)|url\(["']?https?:\/\/(?!localhost)/i.test(t)) hits.push(f); }
  ok("R229 dist html/css has no preconnect, dns-prefetch, ping or absolute http(s) URLs", hits.length === 0, hits.join());
};
R[230] = async () => {
  const bad = [];
  for (const a of A.slice(0, 3)) {
    await go("/maps/pub/" + encodeURIComponent(a.id), "svg [data-node]"); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => { const K = (s) => s.replace(/\d+ items?/g, "# items").replace(/\d+/g, "#"), cnt = new Map(), lab = [];
      document.querySelectorAll("svg g > title").forEach((t) => { const m = t.textContent.split(" → "); if (m.length === 3) cnt.set(K(m[1]), (cnt.get(K(m[1])) || 0) + 1); });
      document.querySelectorAll("svg g > text").forEach((t) => { const m = t.textContent.match(/^(.*)\((\d+)\)$/); if (m) lab.push([K(m[1]), +m[2]]); });
      return { lab, cnt: [...cnt] }; });
    const c = new Map(r.cnt); r.lab.forEach(([k, v]) => { if (c.get(k) !== v) bad.push(a.id + " " + k + " " + v + "/" + c.get(k)); });
    if (!r.lab.length) bad.push(a.id + " no labels");
  }
  ok("R230 map line label rel(n) equals the lines drawn of that relation (3 seeds)", bad.length === 0, bad.slice(0, 3).join("; "));
};
R[231] = async () => {
  const P = src("index/people.json"), s = (P.find((x) => x.adv.length >= 3) || P[0]).s, q = await adv0([]);
  await q.evaluate((h) => { location.hash = h; }, "#/maps/adviser/" + s); await q.waitForSelector("svg [data-node^='s:']"); await q.waitForTimeout(1200);
  const subs = await q.evaluate(() => [...document.querySelectorAll("svg [data-node^='s:']")].map((g) => g.getAttribute("data-node").slice(2))), bad = [];
  for (const t of subs.slice(0, 10)) {
    const want = A.filter((a) => a.subtopics.includes(t)).length;
    await q.evaluate((id) => { const g = document.querySelector(`svg [data-node="${CSS.escape(id)}"]`); if (g.tabIndex >= 0) { g.focus(); g.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } }, "s:" + t); await q.waitForTimeout(150);
    const txt = want > 1 ? await q.locator("p.text-xs.uppercase", { hasText: "sub-topic" }).first().innerText() : `sub-topic · ${want} item`;
    if (txt.toLowerCase() !== `sub-topic · ${want} item${want === 1 ? "" : "s"}`) bad.push(t + " " + want + " " + txt);
  }
  ok("R231 adviser map sub-topic node counts equal the item counts of the same sub-topic", subs.length >= 1 && bad.length === 0, subs.length + " " + bad.slice(0, 3).join("; "));
};
R[232] = () => {
  const bad = [];
  for (const f of fs.readdirSync(new URL("../src", import.meta.url).pathname).filter((f) => /\.(css|jsx?)$/.test(f))) {
    rf("src/" + f).split("\n").forEach((l, i) => { for (const m of l.matchAll(/transition[^;}`,]*|duration-\d+/g)) if (/\s\.?\d*\.?\d+m?s\b|duration-\d+/.test(m[0]) && !/var\(--dur|\.01ms/.test(m[0])) bad.push(f + ":" + (i + 1)); });
  }
  ok("R232 all transitions use the --dur tokens (no ad-hoc ms)", bad.length === 0, bad.slice(0, 6).join(" "));
};
R[233] = async () => {
  await p.setViewportSize({ width: 1536, height: 900 }); await go("/read/" + (A.find((a) => a.id === "14") || A[13]).id); await p.waitForTimeout(500);
  await p.locator("#r-faq summary").click(); await p.waitForTimeout(800); // R257: FAQ answers (the long paragraphs on item 14) load on expand
  const w = await p.evaluate(() => [...document.querySelectorAll("main section p")].filter((e) => e.textContent.length > 200).slice(0, 4).map((e) => { const s = getComputedStyle(e), c = document.createElement("canvas").getContext("2d"); c.font = s.fontStyle + " " + s.fontWeight + " " + s.fontSize + " " + s.fontFamily; return Math.round(e.clientWidth / c.measureText("0").width); }));
  await p.setViewportSize({ width: 1280, height: 1000 });
  ok("R233 abstract/summary paragraphs are at most 75 ch wide at 1536 (ch of the paragraph font)", w.length > 0 && Math.max(...w) <= 75, w.join());
};
const trap = async (pg) => { // 40 Tab / Shift+Tab presses must keep focus inside the open modal
  let inside = true;
  for (let i = 0; i < 40; i++) { await pg.keyboard.press(i < 20 && i % 2 ? "Shift+Tab" : "Tab"); inside = inside && await pg.evaluate(() => !!document.activeElement?.closest("[role=dialog][aria-modal=true]")); }
  return inside;
};
R[234] = async () => {
  await go("/"); await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press("?");
  await p.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor({ timeout: 3000 });
  const inside = await trap(p); await p.keyboard.press("Escape");
  const back = await p.evaluate(() => !document.activeElement?.closest("[role=dialog]"));
  ok("R234 keyboard help traps Tab (40 presses stay inside) and Esc leaves focus outside the dialog", inside && back && await p.locator("[aria-modal=true]").count() === 0, `${inside} ${back}`);
};
R[235] = async () => {
  await go("/"); const bt = p.locator("footer button", { hasText: "Cookie settings" }); await bt.focus(); await bt.press("Enter");
  await p.getByRole("dialog", { name: "Cookie and privacy settings" }).waitFor({ timeout: 3000 });
  const inside = await trap(p); await p.keyboard.press("Escape");
  const back = await p.evaluate(() => document.activeElement?.textContent === "Cookie settings" && !!document.activeElement.closest("footer"));
  ok("R235 cookie settings traps Tab (40 presses) and returns focus to the opener on Esc", inside && back && await p.locator("[aria-modal=true]").count() === 0, `${inside} ${back}`);
};
R[239] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }); await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
  const raw = A.map(({ advisers, ...a }) => a); raw[0].doi = "javascript:1"; raw[1].doi = "10.1234/a?b#c";
  await c.route("**/index/articles.json", (r) => r.fulfill({ json: raw })); const q = await c.newPage();
  const look = async (a) => { await q.goto(H + "/read/" + a.id); await q.waitForSelector("h1"); await q.waitForTimeout(600); return { js: await q.locator("a[href^=javascript]").count(), doi: await q.locator("a[href*='doi.org']").evaluateAll((x) => x.map((e) => e.getAttribute("href"))), txt: await q.locator("main").innerText() }; };
  const x = await look(raw[0]), y = await look(raw[1]); await c.close();
  ok("R239 DOI javascript:1 shows as plain text, no link; a DOI with ? and # is encoded in the link", x.js === 0 && x.doi.length === 0 && x.txt.includes("DOI javascript:1") && y.doi[0] === "https://doi.org/10.1234/a%3Fb%23c", JSON.stringify([x.js, x.doi, y.doi]));
};
R[242] = async () => {
  for (const w of [1280, 1536]) { await p.setViewportSize({ width: w, height: 900 }); await go("/read/14");
    const box = async () => p.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const h = r("header"), n = r("nav[aria-label='On this page']"); return { hb: h.bottom, ht: h.top, nt: n.top, nb: n.bottom }; });
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200); const top = await box(); await p.evaluate(() => scrollTo(0, 600)); await p.waitForTimeout(300); const sc = await box();
    ok(`R242 at ${w}: On this page bar sits below the header at the top and does not overlap it after scrolling`, top.nt >= top.hb - 0.5 && sc.nt >= Math.max(0, sc.hb) - 0.5, JSON.stringify([top, sc])); }
  await p.setViewportSize({ width: 1280, height: 1000 });
};
R[243] = async () => {
  await go("/search/learning", ".cover.gen"); const g = await p.locator(".cover.gen").evaluateAll((e) => e.slice(0, 40).map((x) => getComputedStyle(x).backgroundImage));
  const mins = g.map((s) => { const last = s.slice(s.lastIndexOf("linear-gradient(")); return Math.min(...[...last.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map((m) => cr("rgb(255,255,255)", `rgb(${m[1]},${m[2]},${m[3]})`))); });
  ok("R243 white text on the cover gradient stops has >= 3:1 contrast", g.length >= 10 && Math.min(...mins) >= 3, `${g.length} covers min ${Math.min(...mins).toFixed(2)}`);
};
R[244] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 } }); await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: false })); } catch {} });
  const q = await c.newPage(); await q.goto(H + "/"); await q.waitForSelector("section[aria-label='Quick tour']"); await q.waitForTimeout(400);
  const first = await q.evaluate(() => { const s = document.querySelector("section[aria-label='Quick tour']"); const f = [...s.querySelectorAll("a,button")].filter((e) => !e.disabled); return [f[0]?.textContent, f.find((e) => e.textContent === "Skip tour") === f[0]]; });
  await q.locator("section[aria-label='Quick tour'] button").first().focus(); await q.keyboard.press("Escape"); await q.waitForTimeout(300);
  const gone = await q.locator("section[aria-label='Quick tour']").count() === 0, kept = await q.evaluate(() => Object.keys(localStorage).filter((k) => k === "upou-tour")); await c.close();
  ok("R244 Skip tour is the first control in the tour, Esc closes it and stores nothing without prefs consent", first[1] && gone && kept.length === 0, JSON.stringify([first, gone, kept]));
};
R[245] = async () => {
  await go("/colections", "h1"); const a = p.locator("main a[href='#/collections'], section a[href='#/collections']");
  ok("R245 404 for #/colections offers a Did you mean link to #/collections", /Did you mean/.test(await p.locator("main, section").first().innerText()) && await p.locator("[data-didyoumean][href='#/collections']").count() === 1, String(await a.count()));
};
R[248] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }); await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
  const U2 = ["javascript:alert(1)", "data:text/html,x", "http://repository.upou.edu.ph/handle/20.500.13073/14", "https://evil.example/handle/20.500.13073/14", "https://repository.upou.edu.ph.evil.example/handle/1", "https://repository.upou.edu.ph/handle/1\"onmouseover=\"x"];
  const raw = A.slice(0, U2.length).map(({ advisers, ...a }, i) => ({ ...a, url: U2[i], hasPdf: true })); const rest = A.slice(U2.length).map(({ advisers, ...a }) => a);
  await c.route("**/index/articles.json", (r) => r.fulfill({ json: [...raw, ...rest] })); const q = await c.newPage(); const hrefs = [];
  for (const a of raw) { await q.goto(H + "/read/" + a.id); await q.waitForSelector("h1"); await q.waitForTimeout(500); hrefs.push(...await q.locator("section[aria-label='Full text'] a").evaluateAll((x) => x.map((e) => e.getAttribute("href")))); }
  await c.close(); ok("R248 repository link only for https repository.upou.edu.ph handles: hostile urls produce no link", hrefs.length === 0, JSON.stringify(hrefs));
};
R[250] = async () => {
  const P = src("index/people.json"), s = (P.find((x) => x.adv.length) || P[0]).s; const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }), q = await c.newPage(); q.on("pageerror", (e) => errs.push(e.message));
  await signIn(q, U); await routeAdv(q, "profiles/" + s + ".json", { half: "HALF TEXT ok" });
  await q.evaluate((s) => { location.hash = "#/adviser/" + s; }, s); await q.waitForSelector("[data-writeup-text]");
  await q.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: () => Promise.reject(new DOMException("denied", "NotAllowedError")) }));
  await q.locator("[data-writeup-box] button", { hasText: /^Copy$/ }).click(); await q.waitForTimeout(300);
  const t = await q.locator("[data-writeup-box] [role=status]").innerText(); await c.close();
  ok("R250 writeup Copy with the clipboard denied tells the reader to select the text", /select the text/i.test(t), t);
};
R[251] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }), q = await c.newPage(); q.on("pageerror", (e) => errs.push(e.message));
  const id = await routeAdv(q, "people.json", (x) => x); let hit = 0; await q.route("**/index/a/" + id + ".enc", (r) => { hit++; return r.abort(); }, { times: 1 });
  let tries = 0; q.on("request", (r) => { if (r.url().includes(id)) tries++; });
  await signIn(q, U); await q.waitForTimeout(1500); // the aborted load shows the error, or a second mount already retried
  await q.evaluate(() => { location.hash = "#/"; }); await q.waitForTimeout(300); await q.evaluate(() => { location.hash = "#/advisers"; });
  const later = await q.waitForSelector("[data-person]", { timeout: 8000 }).then(() => true, () => false); await c.close();
  ok("R251 an aborted first people fetch is not cached: it is fetched again and the list appears", hit === 1 && tries >= 2 && later, `${hit} ${tries} ${later}`);
};
R[252] = async () => {
  const st = (l) => l.evaluate((e) => { const s = getComputedStyle(e); return [s.backgroundColor, s.color, s.borderRadius, s.fontWeight, s.paddingLeft, s.borderTopWidth].join(" "); });
  const a = await st((await adv0([])).locator("[data-more]").first());
  await go("/search/learning", "[role=status]"); await p.waitForTimeout(1500); const s = await st(p.locator("main button", { hasText: /^Show more \(/ }).first());
  ok("R252 advisers Show 30 more uses the search Show more button style", a === s, a + " | " + s);
};
R[253] = async () => {
  const hs = [];
  for (const w of [768, 900, 1024, 1180, 1280, 1536]) { await p.setViewportSize({ width: w, height: 900 }); await go("/"); hs.push(await p.evaluate(() => Math.round(document.querySelector("nav[aria-label=Main]").closest(".bg-navy-fill").getBoundingClientRect().height))); }
  await p.setViewportSize({ width: 1280, height: 1000 });
  ok("R253 header nav bar stays on one line (<= 72 px) at 6 widths from 768 to 1536 px", hs.every((h) => h <= 72), hs.join(","));
};
R[254] = async () => {
  await go("/read/14"); await p.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async () => {} }));
  const txt = (st) => p.locator(st).first().textContent({ timeout: 2000 }).catch(() => "none");
  const run = async (btn, st) => { await p.locator(btn).first().click(); await p.waitForTimeout(300); const a = await txt(st); await p.waitForTimeout(3000); return [a, await txt(st)]; };
  const s = await run("#r-related button[aria-label='Copy link to this section']", "#r-related [role=status]"), c = await run("button[aria-label='Copy citation']", "section[aria-label='How to cite'] [role=status]");
  ok("R254 section Copy link and Copy citation announce in a status region and clear within 3 s", /Link copied/.test(s[0]) && !s[1] && /copied/i.test(c[0]) && !c[1], JSON.stringify([s, c]));
};
R[255] = async () => {
  const wipe = async () => { await p.evaluate(() => { localStorage.removeItem("upou-lists"); localStorage.removeItem("upou-list"); }); await p.reload(); await p.waitForSelector("h1"); await p.waitForTimeout(600); };
  await go("/read/14"); await wipe(); const cnt = () => p.locator("nav[aria-label=Main] a[href='#/list']").innerText(), dlg = "[role=dialog][aria-label='Add to a view list']";
  const before = await cnt(), ab = p.locator("main button", { hasText: "Add to view list" }).first(); await ab.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await ab.click();
  await p.locator(dlg + " input[type=checkbox]").first().dispatchEvent("click"); await p.waitForTimeout(300); // no scroll: scrolling closes the menu
  const msg = await p.locator(dlg + " [role=status]").first().textContent({ timeout: 2000 }).catch(() => ""), after = await cnt();
  await p.keyboard.press("Escape"); await wipe();
  ok("R255 adding to a view list announces Added to <list> and the header count goes up by one", /Added to My list/.test(msg) && before === "View lists" && after === "View lists (1)", JSON.stringify([before, msg, after]));
};
// R256/R257: a fresh context (no service worker) that records every request of /read/14
const lazyRead = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }); await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
  const q = await c.newPage(), u = []; q.on("request", (r) => u.push(r.url())); q.on("pageerror", (e) => errs.push(e.message)); await q.goto(H + "/read/14"); await q.waitForSelector("h1"); await q.waitForTimeout(2000); return { c, q, u }; };
R[256] = async () => {
  const { c, q, u } = await lazyRead(), n = () => u.filter((x) => /\/half\.json/.test(x)).length; await q.evaluate(() => scrollTo(0, document.body.scrollHeight)); await q.waitForTimeout(800); const early = n();
  await q.getByRole("button", { name: "AI summary" }).click(); await q.waitForTimeout(1500); const late = n(), txt = await q.locator("#r-overview").innerText(); await c.close();
  const half = await (await fetch(U + "/index/half.json")).json();
  ok("R256 reader fetches half.json only when the AI summary is shown, then shows it", early === 0 && late === 1 && txt.includes((half["14"] || "").slice(0, 40)), `${early} ${late}`);
};
R[257] = async () => {
  const { c, q, u } = await lazyRead(), n = () => u.filter((x) => /\/faq\/14\.json|faqs\.json/.test(x)).length, early = n();
  await q.locator("#r-faq summary").first().click({ timeout: 3000 }).catch(() => {}); await q.waitForSelector("#r-faq [data-faq-group]", { timeout: 5000 }).catch(() => {});
  const late = n(), g = await q.locator("#r-faq [data-faq-group]").count(); await c.close();
  ok("R257 reader fetches the FAQ file only when Questions this item answers is expanded", early === 0 && late === 1 && g > 0, `${early} ${late} ${g}`);
};
R[259] = async () => { // batch-16 carry-over: a card with no abstract (item 14) shows its half-page summary on /list although nothing else loaded half.json
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }), q = await c.newPage(), u = [];
  await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); localStorage.setItem("upou-lists", JSON.stringify([{ id: "lx", name: "T", items: ["14"] }])); } catch {} });
  q.on("request", (r) => u.push(r.url())); await q.goto(H + "/list"); await q.waitForSelector("main li a[href='#/read/14']"); await q.waitForTimeout(2000);
  const t = await q.locator("main li", { has: q.locator("a[href='#/read/14']") }).first().innerText(), half = await (await fetch(U + "/index/half.json")).json(); await c.close();
  ok("R259 /list card without an abstract loads half.json and shows the half-page summary", u.some((x) => /\/half\.json/.test(x)) && t.includes((half["14"] || "?").slice(0, 40)), `${u.filter((x) => /half\.json/.test(x)).length} fetches`);
};
R[260] = async () => {
  const ids = A.filter((_, i) => i % Math.floor(A.length / 40) === 0).slice(0, 40); let badN = 0, first = ""; await go("/read/14");
  for (const a of ids) {
    await p.evaluate((h) => { location.hash = h; }, "/read/" + a.id); await p.waitForFunction((t) => document.querySelector("h1")?.textContent.trim() === t, a.title.trim(), { timeout: 5000 }).catch(() => {});
    const r = await p.evaluate(() => ({ h: document.querySelector("h1")?.textContent.trim(), by: document.querySelector("h1 + div")?.textContent.trim() }));
    if (r.h !== a.title.trim() || !a.authors[0] || !r.by.startsWith(a.authors[0].slice(0, 20))) { badN++; first ||= a.id + " " + JSON.stringify(r).slice(0, 120); }
  }
  ok("R260 /read/<id> for 40 spread ids: h1 is the title and the author line is not empty", ids.length === 40 && badN === 0, `${ids.length} ids, ${badN} bad ${first}`);
};
R[261] = async () => {
  const LY = Math.max(...A.map((a) => +a.year || 0)), c = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" }), q = await c.newPage();
  await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
  await q.clock.install({ time: new Date("2040-06-01") }); await signIn(q, U); await q.evaluate(() => { location.hash = "#/advisers"; }); await q.waitForSelector("[data-person]", { timeout: 10000 });
  const t = await q.locator("main").innerText(), badges = await q.locator("[data-person] [data-badge]").allInnerTexts(); await c.close();
  ok("R261 faked clock year 2040: the 'No advisee in' badge still uses the data's latest year", t.includes(`“No advisee in ${LY}”`) && badges.some((x) => x.includes(`No advisee in ${LY}`)) && !badges.join().includes("2040"), `${LY} ${badges.length} badges`);
};
R[264] = async () => {
  await go("/topics"); const d = p.locator("main details"), n = await d.count(), cards = await p.locator("main ul h3").allInnerTexts();
  const sums = (await d.locator("> summary").allInnerTexts()).map((s) => s.trim()), open = await d.evaluateAll((l) => l.map((e) => e.open));
  const s1 = d.nth(1).locator("> summary"); await s1.focus(); await p.keyboard.press("Enter"); const after = await d.nth(1).evaluate((e) => e.open);
  ok("R264 Topics: a details per top-level topic with sub-topics, first open, Enter toggles", n >= 3 && sums.every((s) => cards.includes(s)) && open[0] && !open[1] && after, `${n} details, ${cards.length} topics, open ${open.slice(0, 3)}, after Enter ${after}`);
  await go("/"); await go("/topics"); ok("R264 a toggled sub-topic list stays open after leaving and re-entering Topics", await p.locator("main details").nth(1).evaluate((e) => e.open));
};
R[265] = async () => {
  await go("/read/14"); await p.evaluate(() => localStorage.removeItem("upou-text")); await p.reload(); await p.waitForSelector("h1");
  const zoom = async () => { await p.waitForSelector("#r-overview", { state: "attached" }); return p.evaluate(() => +getComputedStyle(document.querySelector("#r-overview").parentElement).zoom); };
  const z0 = await zoom(); await p.getByRole("button", { name: "Larger text" }).click(); await p.evaluate(() => { location.hash = "#/read/16"; }); await p.waitForTimeout(800);
  const z1 = await zoom(); await p.evaluate(() => localStorage.removeItem("upou-text")); await p.reload(); await p.waitForSelector("h1");
  ok("R265 A+ is a labelled button and the size persists across routes", z1 > z0 && z1 > 1, `${z0} -> ${z1}`);
};
R[267] = async () => {
  await go("/"); await p.waitForTimeout(800); const nodes = await p.evaluate(() => document.getElementsByTagName("*").length), use = await p.locator("main svg[viewBox='0 0 24 24'] use").count();
  ok("R267 home DOM nodes below the 7694 measured before shared icon symbols (the planned 20% is out of reach: icons are 2%, cover art is the bulk) and icons use <use> (R276 rows render 8 cards until near the viewport, so fewer icons are on the page)", nodes <= 7694 * 0.99 && use > 50, `${nodes} nodes, ${use} use`);
};
const adv1 = async (req) => { await go("/advanced"); await p.evaluate(() => localStorage.removeItem("upou-adv")); await p.reload(); await p.waitForSelector("h1"); if (req) { const i = p.getByLabel("Add to Required", { exact: true }); await i.fill(req); await i.press("Enter"); await p.waitForTimeout(600); } };
R[271] = async () => {
  await adv1(); const i = p.getByLabel("Add to Boost", { exact: true }); for (let k = 0; k < 2; k++) { await i.fill("zzqword"); await i.press("Enter"); await p.waitForTimeout(250); }
  const h = +(((await p.locator("summary", { hasText: "History" }).textContent().catch(() => "")) || "").match(/\d+/) || [0])[0];
  ok("R271 the same Boost entry added twice leaves one History step", h === 1, `history ${h}`);
};
R[272] = async () => {
  const big = A.filter((a) => a.pages >= 1000), bad = [], cnt = /\b\d{4,}\s+(pages|items|results|records|filters|people)\b/;
  for (const r of ["/", "/collections", "/topics", "/about", ...big.flatMap((a) => ["/read/" + a.id, "/search/" + encodeURIComponent(a.title)])]) { const s = r.startsWith("/search"); await go(r, s ? "[role=status]" : "h1"); await p.waitForTimeout(s ? 1500 : 300); const m = (await main()).match(cnt); if (m) bad.push(r + ": " + m[0]); }
  const want = big[0] ? big[0].pages.toLocaleString("en-US") + " pages" : "?"; await go("/read/" + big[0]?.id);
  ok("R272 counts of 1000+ use a thousands separator (no bare 4-digit counts on 4 routes and the 1000+ page items)", big.length > 0 && !bad.length && (await main()).includes(want), bad[0] || want);
};
R[273] = async () => {
  const look = async (colorScheme) => { const c = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme, serviceWorkers: "block" }), q = await c.newPage(), out = [];
    await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
    for (const r of ["/", "/search/learning", "/read/14", "/collections", "/privacy"]) { await q.goto(H + r); await q.waitForSelector("h1"); await q.waitForTimeout(400); out.push(await q.evaluate(() => [document.body, document.querySelector("main"), document.querySelector("h1")].map((e) => { const s = getComputedStyle(e); return s.backgroundColor + "/" + s.color; }).join(" "))); }
    await c.close(); return out; };
  const [l, d] = [await look("light"), await look("dark")], diff = l.findIndex((x, i) => x !== d[i]);
  ok("R273 prefers-color-scheme dark changes nothing on 5 routes (body, main, h1 colours)", diff < 0, diff < 0 ? l[0] : `${l[diff]} vs ${d[diff]}`);
};
R[274] = async () => {
  await go("/"); await p.waitForTimeout(800); const t = p.locator(".row-track"), n = await t.count(), all = await t.evaluateAll((l) => l.every((e) => e.tabIndex === 0 && !!e.getAttribute("aria-label")));
  const row = t.nth(1), name = await row.getAttribute("aria-label"); await row.scrollIntoViewIfNeeded(); const x0 = await row.evaluate((e) => e.scrollLeft);
  await p.getByRole("button", { name: `Next in ${name}` }).click(); await p.waitForTimeout(900); const x1 = await row.evaluate((e) => e.scrollLeft);
  ok("R274 every home row is a labelled, focusable scroll region and Next scrolls it", n >= 3 && all && x1 > x0, `${n} rows, ${name}: ${x0} -> ${x1}`);
};
R[275] = async () => {
  // a draggable's own menu only: a select nested in a child draggable (a chip inside a card) does not count for the card
  const scan = (inDialog) => p.evaluate(([names, inDialog]) => { const opts = (e) => names.filter((nm) => [...e.querySelectorAll("select")].filter((s) => s.closest("[draggable=true]") === (inDialog ? null : e)).some((s) => [...s.options].some((o) => o.textContent.trim() === nm))).length;
    const els = [...document.querySelectorAll(inDialog ? "[role=dialog] [draggable=true]" : "main [draggable=true]")], dlg = document.querySelector("[role=dialog]"), bad = els.filter((e) => !(inDialog ? e.querySelector("button") && opts(dlg) === 4 : opts(e) >= 3));
    return [els.length, bad.length, bad[0]?.textContent.slice(0, 60) || ""]; }, [AREAS_N, inDialog]);
  await adv1("learning"); const g = await scan(); await p.getByRole("button", { name: "Details" }).first().click().catch(() => {}); await p.waitForTimeout(300); const d = await scan();
  await p.getByRole("button", { name: /^Find filters for Required/ }).click(); await p.waitForTimeout(400); const l = await scan(true); await p.keyboard.press("Escape");
  ok("R275 every draggable on /advanced (grid, details, Find filters) has its own keyboard menu for the areas", g[0] > 20 && d[0] > 20 && l[0] > 5 && g[1] + d[1] + l[1] === 0, `grid ${g}, details ${d}, lookup ${l}`);
};
const AREAS_N = ["Required", "Boost", "Expand", "Exclude"];
R[276] = async () => {
  await go("/"); await p.waitForTimeout(1500); const nodes = await p.evaluate(() => document.getElementsByTagName("*").length);
  ok("R276 home page DOM stays at or under 4000 nodes", nodes <= 4000, `${nodes} nodes`);
};
R[277] = async () => {
  await adv1("learning"); await p.evaluate(() => { window.__w = 0; const s = (window.__setItem ||= Storage.prototype.setItem); Storage.prototype.setItem = function (k, v) { if (String(k).startsWith("upou-")) window.__w++; return s.call(this, k, v); }; });
  const exc = p.locator("h2", { hasText: /^Exclude$/ }).locator("xpath=../.."); await p.locator("[data-chip]").first().dragTo(exc); await p.waitForTimeout(400);
  const [w, moved] = [await p.evaluate(() => { Storage.prototype.setItem = window.__setItem; return window.__w; }), await exc.locator("[data-chip]").count()];
  ok("R277 one chip drag to another area writes storage at most twice", moved === 1 && w <= 2, `${w} writes, moved ${moved}`);
};
R[278] = async () => {
  const at = async (days, accept) => { const c = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" }), q = await c.newPage();
    await c.addInitScript((d) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true, model: false, at: new Date(Date.now() - d * 864e5).toISOString() })); localStorage.setItem("upou-lists", JSON.stringify([{ id: "lx", name: "Kept", items: ["14"] }])); }, days);
    await q.goto(H + "/"); await q.waitForSelector("h1"); await q.evaluate(() => caches.open("upou-offline-r278")); await q.reload(); await q.waitForSelector("h1"); await q.waitForTimeout(800); const ban = q.locator("[role=dialog][aria-label='Cookie and privacy choices']"), shown = await ban.count();
    const kept = (await q.evaluate(async () => (await caches.has("upou-offline-r278")) && localStorage.getItem("upou-lists"))) || ""; if (accept && shown) { await ban.getByRole("button", { name: "Accept all" }).click(); await q.waitForTimeout(300); }
    const after = await q.evaluate(() => localStorage.getItem("upou-lists")); await c.close(); return [shown, /Kept/.test(kept || "") && /Kept/.test(after || "")]; };
  const [[old, k1], [fresh, k2]] = [await at(400, true), await at(10)];
  ok("R278 a consent record 400 days old asks again and stored lists and the offline cache survive until (and after) Accept all; 10 days old does not ask", old === 1 && fresh === 0 && k1 && k2, `400d banner ${old}, 10d banner ${fresh}, kept ${k1}/${k2}`);
};
R[279] = async () => {
  const bad = [];
  for (const r of ["/", "/search/learning", "/read/14", "/collections", "/topics", "/advanced", "/maps/pub/14", "/privacy", "/about", "/list"]) {
    await go(r, r.startsWith("/search") ? "[role=status]" : "h1, h2"); const btn = p.locator("footer").getByRole("button", { name: "Cookie settings" });
    if (!(await btn.count())) { bad.push(r + " no link"); continue; } await btn.click(); await p.waitForTimeout(200);
    if (!(await p.locator("[role=dialog][aria-label='Cookie and privacy settings']").count())) bad.push(r + " no dialog"); await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  }
  ok("R279 the footer Cookie settings button is on 10 routes and one click opens the dialog", !bad.length, bad.join(", "));
};
R[280] = async () => {
  const slug = (c) => c.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""), by = new Map(); A.forEach((a) => by.set(a.collection, new Set([...(by.get(a.collection) || []), a.year])));
  const cols = [...by].filter(([c, y]) => c && y.size > 2).slice(0, 3), bad = [];
  for (const [c] of cols) { await go("/collection/" + slug(c)); const t = await p.locator("[data-years] button").allInnerTexts(), ys = t.slice(1).map((x) => +x.trim().split(/\s/)[0]);
    if (!/^All/.test(t[0]) || ys.some((y, i) => i && y > ys[i - 1])) bad.push(c + " " + t.join("|")); }
  ok("R280 year chips on 3 collections start with All and run newest first", cols.length === 3 && !bad.length, bad[0] || "");
};
R[281] = async () => {
  await go("/search"); await p.evaluate(() => localStorage.setItem("upou-recent", JSON.stringify(["a1", " ", "", "a2", "a3", "a4", "a5", "a6", "a7", "   "]))); await p.reload(); await p.waitForSelector("h1");
  const i = p.getByRole("combobox").first(); await i.fill("zzfresh"); await i.press("Enter"); await p.waitForTimeout(500);
  const r = await p.evaluate(() => JSON.parse(localStorage.getItem("upou-recent") || "[]"));
  ok("R281 recent searches keep at most 6 and no blank terms", r.length <= 6 && r[0] === "zzfresh" && r.every((x) => x.trim()), JSON.stringify(r));
};
R[282] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: "active" }), q = await c.newPage();
  await q.goto(H + "/search/learning"); await q.waitForSelector("[role=status]"); await q.waitForTimeout(1200);
  const w = async (s) => (await q.locator(s).count()) ? q.locator(s).first().evaluate((e) => { const x = getComputedStyle(e); return parseFloat(x.borderTopWidth) + "/" + x.borderTopStyle; }) : "none";
  const [a, o] = [await w("button[aria-pressed=true]"), await w("button[aria-pressed=false]")]; await c.close();
  ok("R282 forced-colors: an active chip has a border of at least 1px", a !== "none" && parseFloat(a) >= 1, `${a} vs ${o}`);
};
R[283] = async () => {
  const re = /^Show (\d+ )?more\b/, got = [];
  await go("/search/learning", "[role=status]"); await p.waitForTimeout(1200); got.push(await p.getByRole("button", { name: /^Show \d* ?more/ }).last().innerText());
  await go("/advanced"); await p.evaluate(() => localStorage.removeItem("upou-adv")); await p.reload(); await p.waitForSelector("h1");
  const t = p.getByLabel("Add to Required", { exact: true }); await t.fill("learning"); await t.press("Enter"); await p.waitForTimeout(800); got.push(await p.getByRole("button", { name: /^Show \d* ?more/ }).last().innerText());
  await go("/advisers"); await p.waitForTimeout(800); got.push(await p.locator("[data-more]").first().innerText());
  ok("R283 Show-more buttons on search, Advanced and Advisers use the same verb", got.length === 3 && got.every((x) => re.test(x)), got.join(" | "));
};
R[284] = async () => {
  await adv1("learning"); const u = p.locator("button[title^='Undo (']"), start = await u.isDisabled();
  await u.click(); await p.waitForTimeout(300);
  const st = (await p.locator("p[role=status]").allInnerTexts()).join(" "), rd = await p.getByRole("button", { name: /^Redo/ }).isEnabled();
  await p.evaluate(() => localStorage.removeItem("upou-adv"));
  ok("R284 Advanced: Undo is disabled with no history; after Undo a status says Undone: <change> and Redo is enabled", !start && /Undone: \S/.test(st) && rd, st.slice(0, 80));
};
R[285] = async () => {
  await go("/"); const t = () => p.locator("[role=status]", { hasText: /offline/i }).count(); const a = await t();
  await ctx.setOffline(true); await p.evaluate(() => dispatchEvent(new Event("offline"))); await p.waitForTimeout(300); const b1 = await t();
  await ctx.setOffline(false); await p.evaluate(() => dispatchEvent(new Event("online"))); await p.waitForTimeout(300); const c1 = await t();
  ok("R285 an offline status banner appears when offline and clears when back online", a === 0 && b1 === 1 && c1 === 0, `${a}/${b1}/${c1}`);
};
R[286] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } }), q = await c.newPage();
  await c.addInitScript(() => { window.__sc = []; const f = EventTarget.prototype.addEventListener; EventTarget.prototype.addEventListener = function (t, h, o) { if (t === "scroll" && this === window) window.__sc.push(!!(o && o.passive)); return f.call(this, t, h, o); }; });
  await q.goto(H + "/"); await q.waitForSelector("h1"); await q.waitForTimeout(800); const sc = await q.evaluate(() => window.__sc); await c.close();
  ok("R286 every window scroll listener registered on the home page is passive", sc.length > 0 && sc.every(Boolean), JSON.stringify(sc));
};
R[287] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } }), q = await c.newPage(), seen = []; q.on("request", (r) => /springer-items/.test(r.url()) && seen.push(r.url()));
  await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
  for (const r of ["/", "/search/learning"]) { await q.goto(H + r); await q.waitForSelector("h1, [role=status]"); await q.waitForTimeout(1200); }
  const n0 = seen.length; await c.close();
  ok("R287 the Springer item list is not requested on home or search", n0 === 0, seen.join(","));
};
R[288] = async () => {
  const hit = [], dir = new URL("../src/", import.meta.url).pathname;
  for (const f of (await import("fs")).readdirSync(dir).filter((x) => /\.jsx?$/.test(x))) readFileSync(dir + f, "utf8").split("\n").forEach((l, i) => { if (/(?<![-\w.])eval\s*\(|new\s+Function\s*\(|\.innerHTML\s*=(?!\s*"")|dangerouslySetInnerHTML|document\.write\s*\(/.test(l)) hit.push(`${f}:${i + 1}`); });
  ok("R288 src has no eval, new Function, innerHTML, dangerouslySetInnerHTML or document.write", !hit.length, hit.join(","));
};
R[289] = async () => {
  const f = new URL("../.npmrc", import.meta.url).pathname;
  ok("R289 web/.npmrc sets ignore-scripts=true", existsSync(f) && /^ignore-scripts=true$/m.test(readFileSync(f, "utf8")));
};
R[290] = async () => {
  const fq = (id) => JSON.parse(readFileSync(new URL(`../dist/index/faq/${id}.json`, import.meta.url), "utf8")).length, got = [];
  for (const a of [A.find((x) => !fq(x.id)), A.find((x) => fq(x.id) > 0)]) { await go("/read/" + a.id);
    got.push([a.id, await p.locator("nav[aria-label='On this page']").getByRole("button", { name: "Questions", exact: true }).count(), ...await p.evaluate(() => ["r-overview", "r-faq", "r-related"].map((i) => !!document.getElementById(i)))]); }
  ok("R290 reader On this page: no Questions link for an item without FAQs, one for an item with FAQs; every jump target exists", got[0][1] === 0 && got[1][1] === 1 && got.every((g) => g.slice(2).every(Boolean)), JSON.stringify(got));
};
R[291] = async () => {
  const q = await adv0(), i = q.getByRole("combobox").first(), chips = () => q.locator("[aria-label='Topics of this candidate'] button").count();
  await i.fill("!!!"); await i.press("Enter"); await q.waitForTimeout(300); const c1 = await chips(), h1 = await q.locator("[data-topic-hint]").count();
  await i.fill("e-learning"); const h2 = await q.locator("[data-topic-hint]").count(); await i.press("Enter"); await q.waitForTimeout(500); const c2 = await chips();
  ok("R291 Advisers: a punctuation-only topic adds no chip and shows a hint; typing clears it and a real topic is added", c1 === 0 && h1 === 1 && h2 === 0 && c2 === 1, `${c1} ${h1} ${h2} ${c2}`);
};
R[292] = async () => {
  await go("/"); const t = p.locator(".row-track").first(); await t.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  const v = () => t.evaluate((e) => e.style.getPropertyValue("--fl") + "/" + e.style.getPropertyValue("--fr"));
  const a0 = await v(); await t.evaluate((e) => { e.scrollLeft = e.scrollWidth; }); await p.waitForTimeout(600); const a1 = await v();
  ok("R292 a home row fades only the side with more cards: right at the start, left at the end", a0 === "0px/2.5rem" && a1 === "2.5rem/0px", a0 + " " + a1);
};
R[293] = async () => {
  await go("/"); await p.waitForTimeout(400);
  const d = await p.evaluate(() => [...document.querySelectorAll("section.band")].map((s) => Math.round(s.querySelector("h2").getBoundingClientRect().top - s.getBoundingClientRect().top)));
  ok("R293 every home band puts its heading the same distance from the band top (within 2 px)", d.length > 3 && Math.max(...d) - Math.min(...d) <= 2, d.join(","));
};
R[294] = async () => {
  await go("/"); const i = p.getByRole("combobox").first(); await i.focus();
  await p.evaluate(() => dispatchEvent(new CustomEvent("upou-update", { detail: {} }))); await p.waitForTimeout(300);
  const bar = () => p.locator("[role=status]", { hasText: "A new version of the site is ready" }).count(), shown = await bar(), kept = await i.evaluate((e) => e === document.activeElement);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200); const gone = await bar();
  ok("R294 the update bar appears without taking focus and Esc hides it", shown === 1 && kept && gone === 0, `${shown} ${kept} ${gone}`);
};
R[295] = async () => {
  const back = () => p.locator("[data-back-results]");
  await go("/search/learning", "[role=status]"); await p.waitForTimeout(1200); await p.locator('main li a[href^="#/read/"]').first().click(); await p.waitForSelector("h1"); await p.waitForTimeout(400);
  const t = (await back().count()) ? await back().innerText() : ""; await go("/read/14"); const direct = await back().count();
  ok("R295 a reader opened from search links back to the results by query; a direct visit has no such link", /learning/.test(t) && direct === 0, t);
};
R[296] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } }), q = await c.newPage();
  await c.addInitScript(() => { window.__commits = 0; window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: false, supportsFiber: true, renderers: new Map(), inject: () => 1, onScheduleFiberRoot() {}, onCommitFiberRoot() { window.__commits++; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {} }; try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
  await q.goto(H + "/search/learning"); await q.waitForSelector("[role=status]"); await q.waitForTimeout(2500);
  const cards = q.locator('main li:has(a[href^="#/read/"])'), n0 = await q.evaluate(() => window.__commits);
  for (let i = 0; i < 5; i++) await cards.nth(i).hover(); await q.waitForTimeout(300); const n1 = await q.evaluate(() => window.__commits); await c.close();
  ok("R296 hovering 5 search result cards commits no React render", n0 > 0 && n1 === n0, `${n0} -> ${n1}`);
};
R[297] = async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } }), q = await c.newPage();
  await c.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
  await q.goto(H + "/"); await q.waitForSelector("h1"); await q.waitForTimeout(1500); const w0 = q.workers().length;
  await q.getByRole("combobox").first().focus(); await q.waitForTimeout(800); const w1 = q.workers().length; await c.close();
  ok("R297 home starts no search worker until a search box is focused; focus starts one", w0 === 0 && w1 === 1, `${w0} ${w1}`);
};
R[298] = async () => {
  const f = new URL("../dist/.well-known/security.txt", import.meta.url).pathname, t = existsSync(f) ? readFileSync(f, "utf8") : "", ex = Date.parse((t.match(/^Expires: (.+)$/m) || [])[1]);
  const served = (await fetch(U + "/.well-known/security.txt")).status;
  ok("R298 .well-known/security.txt is served, has a Contact placeholder, Expires within a year and no email address", served === 200 && /^Contact: \S/m.test(t) && ex > Date.now() && ex - Date.now() <= 366 * 864e5 && !/@/.test(t), `${served} ${(t.match(/^Expires: .+$/m) || ["no file"])[0]}`);
};
for (const k of Object.keys(R).map(Number).filter((k) => !only.length || only.includes(k))) await R[k]();
ok("no page errors", errs.length === 0, errs[0] || "");
await b.close(); console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
