// Round 35 (needs `vite preview` on :4195): node scripts/href-allowlist.mjs
// Every href/src in dist/**/*.html and in the rendered DOM of sample routes must be same-site (#route, relative, ./) or on the allowlist:
// https://repository.upou.edu.ph[/handle/...] and https://doi.org/10.... Every external link needs target=_blank only with rel noopener noreferrer.
// Also every article url/doi in the index matches the allowlist. Prints "N checks, M FAIL".
import { chromium } from "playwright-core"; import { homedir } from "os"; import { signIn } from "./adv-test.mjs"; import { readFileSync, readdirSync, statSync } from "fs";
const U = "http://localhost:4195", web = new URL("..", import.meta.url).pathname;
const { SITE } = await import("./seo.mjs"); // our own deployed URL (canonical, 404 page) is same-site
const OK = (h) => h.startsWith(SITE + "/") || /^https:\/\/ijodel\.upou\.edu\.ph\/ijodel\/article\/view\/\d+$/.test(h) /* IJODeL article pages, exactly this pattern (R53) */ || !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(h) || /^https:\/\/repository\.upou\.edu\.ph(\/handle\/[\w./%-]+)?\/?$/.test(h) || /^mailto:roque\.almodiel@gmail\.com(\?|$)/.test(h) || /^https:\/\/doi\.org\/10\.\d{4,9}\/[^\s<>"']+$/.test(h);
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; if (!c) { bad++; console.log(`FAIL ${m} ${x}`); } };
const art = JSON.parse(readFileSync(web + "public/index/articles.json", "utf8"));
ok("every article url is a repository handle link", art.every((a) => !a.url || /^https:\/\/repository\.upou\.edu\.ph\/handle\/[\w./%-]+$/.test(a.url)), art.find((a) => a.url && !OK(a.url))?.url);
ok("every article doi is a bare 10.xxxx/... DOI", art.every((a) => !a.doi || OK("https://doi.org/" + a.doi) && !a.doi.startsWith("http")), art.find((a) => a.doi && !OK("https://doi.org/" + a.doi))?.doi);
const walk = (d) => readdirSync(d).flatMap((f) => { const p = d + "/" + f; return statSync(p).isDirectory() ? (f === "assets" || f === "index" ? [] : walk(p)) : p.endsWith(".html") ? [p] : []; });
const files = walk(web + "dist"), badS = [];
for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/<(?:a|script|img|iframe|form)\b[^>]*?\b(?:href|src|action)="([^"]*)"/g)) if (!OK(m[1])) badS.push(f.split("dist/")[1] + " " + m[1]);
ok(`${files.length} built HTML pages: every href/src same-site or allowlisted`, !badS.length, badS.slice(0, 3).join(" | "));
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox"] });
const ctx = await b.newContext(); await ctx.addInitScript(() => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, lists: true })); } catch {} });
const p = await ctx.newPage(); let links = 0, attrs = 0; const badL = [], badA = [];
const withDoi = art.find((a) => a.doi), plain = art.slice(0, 12).map((a) => a.id);
const ijp = JSON.parse(readFileSync(web + "public/index/people.json", "utf8")).find((q) => q.ij?.length);
await signIn(p, U);
for (const r of ["/", "/adviser/" + ijp.s, "/collections", "/faculty", "/privacy", "/about", "/search/learning", "/advanced", ...[withDoi.id, ...plain].map((i) => "/read/" + i)]) {
  await p.goto(U + "/#" + r); await p.waitForSelector("h1, h2"); await p.waitForTimeout(400);
  for (const a of await p.$$eval("a[href]", (as) => as.map((a) => [a.getAttribute("href"), a.target, a.rel]))) { links++;
    if (!OK(a[0])) badL.push(r + " " + a[0]); else if (/^https?:/.test(a[0]) && !(a[1] === "_blank" && /noopener/.test(a[2]) && /noreferrer/.test(a[2]))) badL.push(r + " no rel " + a[0]); }
  // R238: src / action / formaction attributes and inline-style or stylesheet url() in the rendered DOM
  for (const v of await p.$$eval("[src],[action],[formaction],[style*='url(']", (es) => es.flatMap((e) => [e.getAttribute("src"), e.getAttribute("action"), e.getAttribute("formaction"), ...[...(e.getAttribute("style") || "").matchAll(/url\(\s*["']?([^"')]*)/g)].map((m) => m[1])].filter((x) => x != null))))
    { attrs++; if (!OK(v)) badA.push(r + " " + v.slice(0, 60)); }
}
ok(`${links} rendered links on 21 routes: allowlisted, external ones noopener noreferrer`, !badL.length, badL.slice(0, 3).join(" | "));
ok(`${attrs} rendered src/action/formaction/style url() values on the same routes: 0 non-allowlisted`, !badA.length, badA.slice(0, 3).join(" | "));
const badC = []; for (const f of readdirSync(web + "dist/assets").filter((f) => f.endsWith(".css"))) for (const m of readFileSync(web + "dist/assets/" + f, "utf8").matchAll(/url\(\s*["']?([^"')]*)/g)) if (!OK(m[1]) && !/^data:(image\/(svg\+xml|png|webp)|font\/woff2?);/.test(m[1])) badC.push(f + " " + m[1].slice(0, 60));
ok("built CSS url() values are same-site (or inlined data: image/font)", !badC.length, badC.slice(0, 3).join(" | "));
await b.close(); console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
