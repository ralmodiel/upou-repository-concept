// Production build step (after vite build): encrypts every adviser-only file in dist/ with AES-256-GCM and removes the plaintext.
//   node scripts/encrypt-dist.mjs --check   verifies ADV_USER / ADV_PASS against public/index/k.json and exits (run BEFORE vite build: fail fast)
//   node scripts/encrypt-dist.mjs           encrypts dist/ (DIST env overrides the folder, for tests), then runs the guard below
//   node scripts/encrypt-dist.mjs --guard   no credentials (build:ci): drops dist/faculty, then fails if dist/ holds any plaintext adviser file or an "advisers" key in index/articles.json (build:ci)
// A wrong or missing secret fails the build, so a locked site that nobody can open is never deployed. Credentials come from env only; they are never printed or written.
// scripts/seal-snapshot.mjs reuses keyFromEnv / sealDist / advFiles to refresh the committed ciphertext snapshot (web/sealed/).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { open, seal, fileId } from "../src/accessCrypto.js";
const W = new URL("..", import.meta.url).pathname;
const die = (m) => { console.error("ACCESS BUILD FAILED: " + m); process.exit(1); };

export async function keyFromEnv() {
  const { ADV_USER: user, ADV_PASS: pass } = process.env;
  if (!user) die("ADV_USER is empty or missing. Set it inline on the command line (see docs/access.md).");
  if (!pass) die("ADV_PASS is empty or missing. Set it inline on the command line (see docs/access.md).");
  const k = JSON.parse(readFileSync(join(W, "public/index/k.json"), "utf8"));
  if (!k.salt2) die("public/index/k.json has no salt2. Run: cd web && node scripts/access-init.mjs <user> <pass>, commit k.json, and reseal web/sealed.");
  const K = await open(user, pass, k);
  if (!K) die("ADV_USER / ADV_PASS do not match public/index/k.json. Fix the credentials (or regenerate k.json with scripts/access-init.mjs and reseal web/sealed). Nothing was built.");
  return K;
}

// [logical name, path] of every adviser file under a dist-shaped folder (dist/, or public/ for the plaintext source)
export function advFiles(D) {
  const I = join(D, "index"), jl = (f) => readdirSync(f).filter((x) => x.endsWith(".json")), files = [];
  for (const f of ["people.json", "people.bin", "international.json", "springer.json"]) files.push([f, join(I, f)]);
  for (const d of ["ijodel", "profiles"]) if (existsSync(join(I, d))) for (const f of jl(join(I, d))) files.push([`${d}/${f}`, join(I, d, f)]);
  if (existsSync(join(D, "faculty/ijodel-articles.json"))) files.push(["ijodel-articles.json", join(D, "faculty/ijodel-articles.json")]);
  return files;
}

// adviser names leave the public articles.json and travel as an encrypted id -> names map (mutates art)
export function splitAdvisers(art) { const amap = {}; for (const a of art) { if (a.advisers?.length) amap[a.id] = a.advisers; delete a.advisers; } return amap; }

export async function sealDist(DIST, K) {
  const I = join(DIST, "index"), files = advFiles(DIST);
  if (!existsSync(join(I, "people.json"))) die(`${I}/people.json is missing (already encrypted, or the build did not run).`);
  const art = JSON.parse(readFileSync(join(I, "articles.json"), "utf8")), amap = splitAdvisers(art);
  writeFileSync(join(I, "articles.json"), JSON.stringify(art));
  const out = join(I, "a"); mkdirSync(out, { recursive: true });
  const ivs = new Set(); // a repeated GCM IV under one key breaks confidentiality: fail the build
  const put = async (rel, bytes) => { const o = await seal(K, rel, bytes), iv = Buffer.from(o.slice(0, 12)).toString("hex"); if (ivs.has(iv)) die("duplicate IV for " + rel); ivs.add(iv); writeFileSync(join(out, (await fileId(K, rel)) + ".enc"), o); };
  for (const [rel, src] of files) await put(rel, readFileSync(src));
  await put("advmap.json", Buffer.from(JSON.stringify(amap)));
  for (const [, src] of files) rmSync(src);
  for (const d of ["ijodel", "profiles"]) rmSync(join(I, d), { recursive: true, force: true });
  rmSync(join(DIST, "faculty"), { recursive: true, force: true }); // faculty folder (names, expertise) is input only; the IJODeL list is inside the encrypted set
  return { n: files.length + 1, items: Object.keys(amap).length };
}

// problems that would publish adviser plaintext; [] = safe
export function guard(D) {
  const I = join(D, "index"), bad = [];
  for (const f of ["people.json", "people.bin", "international.json", "springer.json", "faqs.json", "passages.json"]) if (existsSync(join(I, f))) bad.push("index/" + f);
  for (const d of ["index/ijodel", "index/profiles", "faculty"]) if (existsSync(join(D, d))) bad.push(d + "/");
  const a = join(I, "articles.json");
  if (!existsSync(a) || readFileSync(a, "utf8").includes('"advisers"')) bad.push('index/articles.json is missing or has an "advisers" key');
  if (!existsSync(join(I, "a")) || !readdirSync(join(I, "a")).some((f) => f.endsWith(".enc"))) bad.push("index/a/ has no encrypted files (the Advisers login would not open)");
  return bad;
}

if (import.meta.main) {
  const DIST = process.env.DIST || join(W, "dist"), check = () => { const g = guard(DIST); if (g.length) die("plaintext adviser data in dist: " + g.join(", ")); console.log("access: dist guard passed (no plaintext adviser file, no advisers key)"); };
  if (process.argv.includes("--guard")) { rmSync(join(DIST, "faculty"), { recursive: true, force: true }); check(); process.exit(0); } // build:ci: faculty/ (README, schema example) is input only, as in sealDist
  const K = await keyFromEnv();
  if (process.argv.includes("--check")) { console.log("access: credentials match k.json"); process.exit(0); }
  const { n, items } = await sealDist(DIST, K);
  console.log(`access: ${n} adviser files encrypted (AES-256-GCM), plaintext removed, adviser names stripped from articles.json (${items} items)`);
  check();
}
