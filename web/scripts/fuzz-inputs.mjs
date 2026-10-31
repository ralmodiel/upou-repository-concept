// Input hardening (round 90; needs `vite preview` on :4195): node scripts/fuzz-inputs.mjs
// Hostile URL hashes (routes, search, shared lists/state, reader page links) and poisoned localStorage for every key the app
// reads. A case passes when the page throws no uncaught error, shows no error boundary and still renders a heading.
import { chromium } from "playwright-core"; import { homedir } from "os";
const U = "http://localhost:4195/";
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox"] });
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; if (!c) { bad++; console.log(`FAIL ${m} ${x}`); } };
const big = "a".repeat(200000), ids = Array.from({ length: 5000 }, (_, i) => i).join(",");
const HASH = ["/%", "/%E0%A4%A", "/search/%ZZ%", "/search/" + big, "/search/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E", "/search/author:%22", "/search/year:9999-1", "/search/-", "/search/\"\"\"",
  "/read/__proto__", "/read/constructor", "/read/14/p/999999/%ZZ", "/read/14/p/-1/x", "/read/../../etc/passwd", "/maps/pub/__proto__", "/maps/tag/%", "/maps/x/y/z", "/maps/pub/" + big.slice(0, 5000),
  "/list/share/x/" + ids, "/list/share/%/%", "/list/share/" + big.slice(0, 3000) + "/3", "/list/__proto__", "/advanced/" + big.slice(0, 2000), "/advanced?s=%7B%22req%22%3A1%7D", "/cat/%", "/collections/%E0%A4%A", "/collection/%E0%A4%A", "/group/%E0%A4%A", "/group/%", "/maps/tag/%E0%A4%A", "/read/%E0%A4%A", "/read/14/p/%E0%A4%A", "/advisers/%E0%A4%A", "/adviser/%E0%A4%A", "/tag/__proto__", "/year/-1e309", "/issue/0.0", "/" + "/".repeat(500), "/ /\u0000/\uD800"];
const BAD = ['{"__proto__":{"x":1}}', "null", "1", '"str"', "[[[[]]]]", "{", big, '{"req":[{"k":"tag","v":{"a":1}}],"boost":5}', '[{"name":1,"ids":"x"}]', '[null,{"name":"' + big.slice(0, 1000) + '"}]',
  // R258: a ~5 MB valid value (must be ignored, not parsed) and prototype-named keys/kinds in every shape the app reads
  "[" + '{"id":"l1","name":"n","items":["14"]},'.repeat(130000) + "0]", '[{"id":"__proto__","name":"__proto__","items":["__proto__"]},{"__proto__":{"x":1},"id":"l2","name":"y","items":[]}]',
  '{"tabs":[{"id":"__proto__","name":"n","topics":[{"k":"__proto__","v":"x"},{"k":"constructor","v":"y"},{"k":"toString","v":"z"}]}],"active":"__proto__"}', '{"req":[{"k":"__proto__","v":"x"},{"k":"constructor","v":"y"}],"__proto__":{"x":1}}'];
const KEYS = ["upou-lists", "upou-list", "upou-adv", "upou-adv-mode", "upou-recent", "upou-saved", "upou-cite", "upou-map-seed", "upou-tour", "upou-consent", "upou-committee"];
async function check(name, hash, seed) {
  const c = await b.newContext(); await c.addInitScript(([seed]) => { try { localStorage.setItem("upou-consent", JSON.stringify({ prefs: true })); for (const [k, v] of seed) localStorage.setItem(k, v); } catch {} }, [seed]);
  const p = await c.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("crash", () => errs.push("crash"));
  await p.goto(U + "#" + hash, { timeout: 30000 }).catch((e) => errs.push("goto " + e.message.slice(0, 60)));
  await p.waitForSelector("h1, h2", { timeout: 10000 }).catch(() => errs.push("no heading"));
  await p.waitForTimeout(400); const boundary = await p.locator("text=Something went wrong on this page").count();
  const polluted = await p.evaluate(() => Object.getOwnPropertyNames(Object.prototype).length !== 12 || Object.keys(Object.prototype).length > 0 || ({}).x !== undefined).catch(() => false);
  ok(name, !errs.length && !boundary && !polluted, (errs[0] || (boundary ? "error boundary" : polluted ? "Object.prototype changed" : "")).slice(0, 140)); await c.close();
}
for (const h of HASH) await check("hash " + h.slice(0, 60), h, []);
for (const k of KEYS) for (const [i, v] of BAD.entries()) await check(`localStorage ${k} #${i}`, k === "upou-adv" || k === "upou-adv-mode" ? "/advanced" : k.includes("list") ? "/list" : k === "upou-cite" ? "/read/14" : k === "upou-committee" ? "/maps/pub/14" : "/search", [[k, v]]);
await b.close(); console.log(`${n} cases, ${bad} FAIL`); process.exit(bad ? 1 : 0);
