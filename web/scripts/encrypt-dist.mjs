// Production build step (after vite build): encrypts every adviser-only file in dist/ with AES-256-GCM and removes the plaintext.
//   node scripts/encrypt-dist.mjs --check   verifies ADV_USER / ADV_PASS against public/index/k.json and exits (run BEFORE vite build: fail fast)
//   node scripts/encrypt-dist.mjs           encrypts dist/ (DIST env overrides the folder, for tests)
// A wrong or missing secret fails the build, so a locked site that nobody can open is never deployed. Credentials come from env only; they are never printed or written.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { open, seal, fileId } from "../src/accessCrypto.js";
const W = new URL("..", import.meta.url).pathname, DIST = process.env.DIST || join(W, "dist"), I = join(DIST, "index");
const die = (m) => { console.error("ACCESS BUILD FAILED: " + m); process.exit(1); };
const { ADV_USER: user, ADV_PASS: pass } = process.env;
if (!user) die("ADV_USER is empty or missing. Set the repository secret ADV_USER (see docs/access.md).");
if (!pass) die("ADV_PASS is empty or missing. Set the repository secret ADV_PASS (see docs/access.md).");
const k = JSON.parse(readFileSync(join(W, "public/index/k.json"), "utf8"));
if (!k.salt2) die("public/index/k.json has no salt2. Run: cd web && node scripts/access-init.mjs <user> <pass>, commit k.json, and update both secrets.");
const K = await open(user, pass, k);
if (!K) die("ADV_USER / ADV_PASS do not match public/index/k.json. Fix the secrets (or regenerate k.json with scripts/access-init.mjs and update both secrets). Nothing was built.");
if (process.argv.includes("--check")) { console.log("access: credentials match k.json"); process.exit(0); }

const jl = (f) => readdirSync(f).filter((x) => x.endsWith(".json"));
const files = []; // [logical name, source path]
for (const f of ["people.json", "people.bin", "international.json", "springer.json"]) files.push([f, join(I, f)]);
for (const d of ["ijodel", "profiles"]) if (existsSync(join(I, d))) for (const f of jl(join(I, d))) files.push([`${d}/${f}`, join(I, d, f)]);
if (existsSync(join(DIST, "faculty/ijodel-articles.json"))) files.push(["ijodel-articles.json", join(DIST, "faculty/ijodel-articles.json")]);
if (!existsSync(join(I, "people.json"))) die("dist/index/people.json is missing (already encrypted, or the build did not run).");
// adviser names leave the public articles.json and travel as an encrypted id -> names map
const art = JSON.parse(readFileSync(join(I, "articles.json"), "utf8")), amap = {};
for (const a of art) { if (a.advisers?.length) amap[a.id] = a.advisers; delete a.advisers; }
writeFileSync(join(I, "articles.json"), JSON.stringify(art));
const out = join(I, "a"); mkdirSync(out, { recursive: true });
const ivs = new Set(); // a repeated GCM IV under one key breaks confidentiality: fail the build
const put = async (rel, bytes) => { const o = await seal(K, rel, bytes), iv = Buffer.from(o.slice(0, 12)).toString("hex"); if (ivs.has(iv)) die("duplicate IV for " + rel); ivs.add(iv); writeFileSync(join(out, (await fileId(K, rel)) + ".enc"), o); };
for (const [rel, src] of files) await put(rel, readFileSync(src));
await put("advmap.json", Buffer.from(JSON.stringify(amap)));
for (const [, src] of files) rmSync(src);
for (const d of ["ijodel", "profiles"]) rmSync(join(I, d), { recursive: true, force: true });
rmSync(join(DIST, "faculty"), { recursive: true, force: true }); // faculty folder (names, expertise) is input only; the IJODeL list is inside the encrypted set
console.log(`access: ${files.length + 1} adviser files encrypted (AES-256-GCM), plaintext removed, adviser names stripped from articles.json (${Object.keys(amap).length} items)`);
