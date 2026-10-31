// CI build step (ciphertext-only checkout, no credentials): node scripts/use-sealed.mjs   (npm run build:ci runs it before vite build)
// Copies the committed snapshot into public/index/: sealed/articles.json and sealed/faqs.json (no advisers, adviser-only names scrubbed) and
// sealed/a/*.enc (the encrypted adviser files). Refuses on the author's machine (plaintext present: use npm run build, which encrypts).
import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const W = new URL("..", import.meta.url).pathname, S = join(W, "sealed"), I = join(W, "public/index");
const die = (m) => { console.error("SEALED BUILD FAILED: " + m); process.exit(1); };
if (existsSync(join(I, "people.json"))) die("public/index/people.json exists: this checkout has the adviser plaintext. Use npm run build (it encrypts), not build:ci.");
const encs = existsSync(join(S, "a")) ? readdirSync(join(S, "a")).filter((f) => /^[0-9a-f]{32}\.enc$/.test(f)) : [];
if (!encs.length || !["articles.json", "faqs.json", "k.json"].every((f) => existsSync(join(S, f)))) die("web/sealed is missing or incomplete. Reseal on the author's machine: ADV_USER=.. ADV_PASS=.. node scripts/seal-snapshot.mjs");
if (readFileSync(join(S, "k.json"), "utf8") !== readFileSync(join(I, "k.json"), "utf8")) die("web/sealed was sealed against another public/index/k.json: the login would not open it. Reseal with seal-snapshot.mjs.");
for (const f of ["articles.json", "faqs.json"]) cpSync(join(S, f), join(I, f));
cpSync(join(S, "a"), join(I, "a"), { recursive: true });
console.log(`sealed: ${encs.length} encrypted files, articles.json and faqs.json copied into public/index (ciphertext-only build)`);
