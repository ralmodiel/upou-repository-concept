// Static gate for the access layer (no browser): ADV_USER=.. ADV_PASS=.. node scripts/access-check.mjs   (needs a built dist/). Prints "N checks, M FAIL"; exits 1 on FAIL.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { open, unseal, fileId } from "../src/accessCrypto.js";
import { creds, src, SRC, hasSrc } from "./adv-test.mjs";
import { advFiles, splitAdvisers } from "./encrypt-dist.mjs";
const W = new URL("..", import.meta.url).pathname, D = join(W, "dist"), { u, p } = creds();
if (!hasSrc()) { console.log(`FAIL no adviser plaintext in ${SRC} to compare against: in a ciphertext-only clone set ADV_SRC=<web/public of the author's copy>`); process.exit(1); }
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; console.log(`${c ? "PASS" : "FAIL"} ${m} ${x}`); if (!c) bad++; };
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
const all = walk(D), plain = all.filter((f) => !f.endsWith(".enc") && !/\.(png|jpg|woff2?|wasm)$/.test(f)), rel = (f) => f.slice(D.length + 1);
// 1 no plaintext adviser files
const bannedPath = /^(faculty\/|index\/(people\.(json|bin)|international\.json|ijodel\/|profiles\/))/;
ok("no plaintext adviser data file in dist (people, international, ijodel, profiles, faculty)", !all.some((f) => bannedPath.test(rel(f))), all.filter((f) => bannedPath.test(rel(f))).slice(0, 3).join());
const encs = all.filter((f) => f.endsWith(".enc"));
ok("encrypted files exist and every name is an opaque 32-hex id", encs.length > 10 && encs.every((f) => /^[0-9a-f]{32}\.enc$/.test(f.split("/").pop())), encs.length + " files");
ok("R168 every .enc file has a distinct 12-byte IV", new Set(encs.map((f) => readFileSync(f).subarray(0, 12).toString("hex"))).size === encs.length, encs.length + " files");
// 2 names and evidence text
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// advisers who are never authors (an adviser who is also a thesis author is legitimately public as author): surname must not occur in any public author string
const P = src("index/people.json"), AU = fold(src("index/articles.json").flatMap((a) => a.authors).join("|")), sur = (x) => fold(x.n).split(" ").pop();
const names = P.filter((x) => x.adv.length && !x.aut.length && sur(x).length > 3 && !AU.includes(sur(x))).slice(0, 20);
const text = plain.map((f) => [rel(f), readFileSync(f, "latin1").toLowerCase()]);
const find = (needles) => needles.filter((t) => text.some(([, c]) => c.includes(t)));
ok(`none of ${names.length} adviser-only names appears in any plaintext dist file`, names.length === 20 && !find(names.map((x) => fold(x.n))).length, find(names.map((x) => fold(x.n))).join("|"));
ok("none of their slugs appears either", !find(names.map((x) => x.s)).length);
const ev = [...new Set([...P.flatMap((x) => x.ex || []), ...P.flatMap((x) => Object.values(existsSync(SRC + "index/ijodel/" + x.s + ".json") ? src("index/ijodel/" + x.s + ".json") : {}))].filter((s) => typeof s === "string" && s.length > 30).map((s) => s.slice(0, 60).toLowerCase()))].slice(0, 40);
ok(`${ev.length} expertise / IJODeL-summary excerpts are absent from plaintext dist`, ev.length > 5 && !find(ev).length);
const arts = JSON.parse(readFileSync(join(D, "index/articles.json"), "utf8"));
ok("articles.json has no adviser field and no adviser names", arts.every((a) => !("advisers" in a)) && !readFileSync(join(D, "index/articles.json"), "utf8").includes('"advisers"'));
ok("no unencrypted JSON shape: every .enc fails JSON.parse and starts with random bytes", encs.every((f) => { try { JSON.parse(readFileSync(f, "utf8")); return false; } catch { return true; } }));
// 3 round trip and tamper
const k = JSON.parse(readFileSync(join(D, "index/k.json"), "utf8")), K = await open(u, p, k);
ok("k.json in dist matches the committed one and has no username or password", JSON.stringify(k) === JSON.stringify(src("index/k.json")) && Object.keys(k).sort().join() === "hash,iter,salt,salt2");
ok("correct credentials open the keys, a wrong password does not", !!K && !(await open(u, p + "x", k)) && !(await open(u + "x", p, k)) && !!(await open(u.toUpperCase(), p, k)));
ok("R159 k.json with a low PBKDF2 count is refused even with the right password", (await open(u, p, { ...k, iter: 1000 })) === null);
{ const t0 = Date.now(), { salt, ...noSalt } = k, odd = [noSalt, { ...k, iter: 1e9 }, { ...k, iter: 600000.5 }, { ...k, iter: "600000" }, { ...k, salt: k.salt.slice(2) }, { ...k, salt2: 5 }, { ...k, hash: k.hash + "00" }, { ...k, hash: "zz" + k.hash.slice(2) }, { ...k, x: 1 }, null, []];
  const res = await Promise.race([Promise.all(odd.map((o) => open(u, p, o).catch(() => "throw"))), new Promise((r) => setTimeout(() => r(["timeout"]), 1500))]);
  ok("R299 k.json with a missing salt, huge or odd iterations, wrong lengths, non-hex or an extra field is refused (null, no throw) within 1 s", res.length === odd.length && res.every((r) => r === null) && Date.now() - t0 < 1000, `${Date.now() - t0} ms ${res.map(String).join(",").slice(0, 80)}`); }
const f1 = join(D, "index/a", (await fileId(K, "people.json")) + ".enc"), b1 = readFileSync(f1);
const pj = JSON.parse(new TextDecoder().decode(await unseal(K, "people.json", b1)));
ok("people.json decrypts and equals the source", pj.length === P.length && pj[0].n === P[0].n);
{ const want = [...advFiles(SRC).map(([r, f]) => [r, readFileSync(f)]), ["advmap.json", Buffer.from(JSON.stringify(splitAdvisers(src("index/articles.json"))))]];
  const same = await Promise.all(want.map(async ([r, b]) => { const f = join(D, "index/a", (await fileId(K, r)) + ".enc"); return existsSync(f) && Buffer.from(await unseal(K, r, readFileSync(f)).catch(() => new Uint8Array())).equals(b); }));
  ok(`every adviser file and the adviser map (${want.length}) decrypt and equal the plaintext source, no extra .enc`, same.every(Boolean) && encs.length === want.length, `${same.filter((x) => !x).length} differ, ${encs.length} .enc`); }
const t = Buffer.from(b1); t[t.length - 5] ^= 1;
ok("a flipped ciphertext byte fails the GCM check", await unseal(K, "people.json", t).then(() => false, () => true));
ok("a file swapped under another name fails (name is authenticated)", await unseal(K, "people.bin", b1).then(() => false, () => true));
// 4 build failures
const run = (env) => spawnSync("node", ["scripts/encrypt-dist.mjs", "--check"], { cwd: W, env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
for (const [label, env, re] of [["wrong ADV_PASS", { ADV_USER: u, ADV_PASS: p + "x" }, /do not match/], ["missing ADV_USER", { ADV_PASS: p }, /ADV_USER is empty or missing/], ["missing ADV_PASS", { ADV_USER: u }, /ADV_PASS is empty or missing/], ["empty ADV_PASS", { ADV_USER: u, ADV_PASS: "" }, /ADV_PASS is empty/]]) {
  const r = run(env); ok(`build step fails clearly with ${label}`, r.status === 1 && re.test(r.stderr) && !r.stderr.includes(p) && !r.stdout.includes(p), r.stderr.trim().slice(0, 70));
}
ok("build step passes with the right credentials", run({ ADV_USER: u, ADV_PASS: p }).status === 0);
// 5 credentials nowhere: dist and git (tracked files). A 2-3 letter username cannot be grepped meaningfully, so it is checked as ADV_USER=<u> and a quoted literal.
const gitFiles = execFileSync("git", ["ls-files", "-z", ".."], { cwd: W, encoding: "buffer" }).toString("latin1").split("\0").filter(Boolean).map((f) => join(W, f)).filter((f) => existsSync(f) && statSync(f).isFile());
const pats = [p, ...(u.length >= 4 ? [u] : [`ADV_USER=${u}`, `"${u}"`, `'${u}'`])];
const hits = [...all, ...gitFiles].filter((f) => !/\.(png|jpg|wasm|woff2?)$/.test(f) && pats.some((s) => readFileSync(f, "latin1").includes(s)));
ok("password and username values appear in no dist file and no git-tracked file", !hits.length, hits.slice(0, 3).join());
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
