// Refresh the committed ciphertext snapshot web/sealed/ from the local adviser plaintext (which exists only on the author's machine):
//   cd web && ADV_USER=.. ADV_PASS=.. node scripts/seal-snapshot.mjs           people-merge, seal, verify; then commit web/sealed
//   cd web && ADV_USER=.. ADV_PASS=.. node scripts/seal-snapshot.mjs --check   verify only: exit 1 when web/sealed is stale or does not open
// Same sealing as the production build (encrypt-dist.mjs sealDist) on a temp copy in web/.tmp; adviser-only names are scrubbed from the
// summaries and FAQs exactly as seo.mjs does. CI (npm run build:ci -> use-sealed.mjs) builds from web/sealed with no credentials.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { keyFromEnv, sealDist, advFiles, splitAdvisers } from "./encrypt-dist.mjs";
import { advScrub } from "./seo.mjs";
import { unseal, fileId } from "../src/accessCrypto.js";
const W = new URL("..", import.meta.url).pathname, P = join(W, "public"), OUT = join(W, "sealed"), rd = (f) => readFileSync(join(P, "index", f), "utf8");
const K = await keyFromEnv();
if (!existsSync(join(W, "data/people.base.json"))) { console.error("SEAL FAILED: no adviser plaintext here (web/data, web/public/index): sealing runs only on the author's machine"); process.exit(1); }
const check = process.argv.includes("--check");
if (!check && spawnSync("node", ["scripts/people-merge.mjs"], { cwd: W, stdio: "inherit" }).status !== 0) process.exit(1);

// what the public snapshot must hold: articles without advisers and with scrubbed text, scrubbed FAQs, the k.json it was sealed against
const scrub = advScrub(JSON.parse(rd("people.json"))), art = JSON.parse(rd("articles.json"));
for (const a of art) for (const k of ["half", "one", "two", "abstract"]) a[k] = scrub(a[k]);
const scrubbed = JSON.stringify(art), amap = splitAdvisers(art); // sealDist gets the scrubbed list with advisers and strips them the same way
const want = { "articles.json": JSON.stringify(art), "faqs.json": scrub(JSON.stringify(JSON.parse(rd("faqs.json")))), "k.json": rd("k.json") };

if (!check) {
  const T = join(W, ".tmp/seal"); rmSync(T, { recursive: true, force: true });
  try {
    for (const [, f] of advFiles(P)) { const d = join(T, f.slice(P.length)); mkdirSync(join(d, ".."), { recursive: true }); cpSync(f, d); }
    writeFileSync(join(T, "index/articles.json"), scrubbed);
    await sealDist(T, K);
    rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT);
    cpSync(join(T, "index/a"), join(OUT, "a"), { recursive: true });
    for (const f of ["faqs.json", "k.json"]) writeFileSync(join(OUT, f), want[f]);
    cpSync(join(T, "index/articles.json"), join(OUT, "articles.json"));
  } finally { rmSync(T, { recursive: true, force: true }); }
}

// verify: every .enc opens with the credentials and equals the local plaintext; nothing stale; public files equal the expected ones
const bad = [];
const exp = [...advFiles(P).map(([rel, f]) => [rel, readFileSync(f)]), ["advmap.json", Buffer.from(JSON.stringify(amap))]];
const encs = existsSync(join(OUT, "a")) ? readdirSync(join(OUT, "a")) : [];
for (const [rel, bytes] of exp) {
  const f = join(OUT, "a", (await fileId(K, rel)) + ".enc");
  const got = existsSync(f) ? await unseal(K, rel, readFileSync(f)).catch(() => null) : null;
  if (!got || !Buffer.from(got).equals(bytes)) bad.push(rel);
}
if (encs.length !== exp.length) bad.push(`${encs.length} .enc files, expected ${exp.length}`);
for (const f of Object.keys(want)) if (!existsSync(join(OUT, f)) || readFileSync(join(OUT, f), "utf8") !== want[f]) bad.push(f);
console.log(`seal: ${exp.length} encrypted files and ${Object.keys(want).length} public files checked against the local plaintext, ${bad.length} FAIL${bad.length ? ": " + bad.slice(0, 5).join(", ") : ""}`);
process.exit(bad.length ? 1 : 0);
