// Third-party network check (needs `vite preview` on :4195): node scripts/third-party.mjs
// 1) all consents on: only allow-listed hosts are contacted, the model gets ready, ORT wasm comes from the pinned
//    jsDelivr URL (or dist/ort/ in an ORT_SELF=1 build);
// 2) jsDelivr blocked and 3) Hugging Face blocked: keyword-only notice, results still shown.
// Prints PASS/FAIL lines and "N checks, M FAIL"; exits 1 on any FAIL.
import { chromium } from "playwright-core"; import { homedir } from "os"; import { readFileSync, existsSync } from "fs";
const U = "http://localhost:4195", self = existsSync(new URL("../dist/ort", import.meta.url));
const ver = JSON.parse(readFileSync(new URL("../node_modules/onnxruntime-web/package.json", import.meta.url))).version;
const HOSTS = /^(localhost|huggingface\.co|([\w-]+\.)+huggingface\.co|([\w-]+\.)+hf\.co|cdn\.jsdelivr\.net)$/;
const b = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--no-sandbox"] });
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; console.log(`${c ? "PASS" : "FAIL"} ${m} ${x}`); if (!c) bad++; };
async function run(block) {
  const c = await b.newContext(); const reqs = [];
  await c.addInitScript(() => localStorage.setItem("upou-consent", JSON.stringify({ prefs: true, model: true })));
  if (block) await c.route(block, (r) => r.abort());
  c.on("request", (r) => reqs.push(r));
  const p = await c.newPage(); await p.goto(U + "/"); await p.waitForSelector("h1");
  await p.getByLabel("Search items").first().focus();
  await p.locator("[data-model=loading]").waitFor({ timeout: 5000 }).catch(() => {}); // appears after focus, then goes
  await p.waitForFunction(() => !document.querySelector("[data-model=loading]"), null, { timeout: 120000 }).catch(() => {});
  return { c, p, reqs, state: await p.evaluate(() => document.querySelector("[data-model]")?.dataset.model || "ready") };
}
{ const { c, p, reqs, state } = await run(null);
  const hosts = [...new Set(reqs.map((r) => new URL(r.url()).hostname).filter(Boolean))]; // data:/blob: have none
  ok("only allow-listed hosts contacted", hosts.every((h) => HOSTS.test(h)), hosts.join(" "));
  ok("model ready with all consents", state === "ready", state);
  const w = reqs.filter((r) => /ort-wasm.*\.wasm$/.test(r.url())).map((r) => r.url());
  ok(self ? "ORT wasm self-hosted (dist/ort)" : `ORT wasm from jsDelivr pinned to onnxruntime-web@${ver}`, w.length > 0 && w.every((u) => self ? u.startsWith(U + "/ort/") : u.includes(`onnxruntime-web@${ver}/`)), w[0] || "none");
  await c.close(); }
for (const [name, pat] of [["jsDelivr", /cdn\.jsdelivr\.net/], ["Hugging Face", /huggingface\.co|hf\.co/]]) {
  const { c, p, state } = await run(pat);
  if (name === "jsDelivr" && self) ok("jsDelivr blocked: self-hosted model still ready", state === "ready", state);
  else ok(`${name} blocked: keyword-only notice`, state === "failed", state);
  await p.getByLabel("Search items").first().fill("libre"); await p.keyboard.press("Enter");
  ok(`${name} blocked: keyword results still shown`, await p.waitForSelector("text=items for", { timeout: 15000 }).then(() => true).catch(() => false));
  await c.close();
}
{ const { readdirSync } = await import("fs"), d = new URL("../dist/", import.meta.url), hits = []; // R229: nothing in built html/css may pre-contact a host
  for (const f of readdirSync(d, { recursive: true }).filter((f) => /\.(html|css)$/.test(f))) if (/rel="?(preconnect|dns-prefetch)|\sping=|<(?:link|script|img|iframe|source|video|audio|embed|object)\b[^>]*\s(?:src|href)=["']?https?:\/\/(?!localhost)|url\(["']?https?:\/\/(?!localhost)/i.test(readFileSync(new URL(f, d), "utf8").replace(/<link[^>]*rel="canonical"[^>]*>/g, ""))) hits.push(f);
  ok("built html and css: no preconnect, dns-prefetch, ping or absolute http(s) URLs", hits.length === 0, hits.join()); }
await b.close(); console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
