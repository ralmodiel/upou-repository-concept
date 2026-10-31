// Dependency policy (run in web/): node scripts/deps.mjs
// Checks: exact pins in package.json, lockfile root matches package.json and every package has an integrity hash,
// licenses of all installed packages on the allow-list, no unused direct dependency, npm audit 0 high/critical.
// Prints one line per problem and "N checks, M FAIL"; exits 1 on any FAIL.
import fs from "node:fs"; import path from "node:path"; import { execSync } from "node:child_process";
const W = path.resolve(import.meta.dirname, ".."), rd = (f) => JSON.parse(fs.readFileSync(path.join(W, f), "utf8"));
const ALLOW = new Set(["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "OFL-1.1", "BlueOak-1.0.0", "CC0-1.0", "Unlicense", "Python-2.0", "CC-BY-4.0", "MPL-2.0"]); // MPL-2.0: file-level copyleft, used unmodified (axe-core, lightningcss)
// LGPL libvips: sharp's native lib, loaded only by transformers in Node (build-index), never shipped in dist
const EXCEPT = /^node_modules\/@img\/sharp-libvips-/;
// Licence expressions such as "(MIT OR Apache-2.0)" pass when one side is allowed; "A AND B" needs both.
const okLic = (l) => !!l && l.replace(/[()]/g, "").split(/\s+OR\s+/).some((alt) => alt.split(/\s+AND\s+/).every((x) => ALLOW.has(x.trim())));
let n = 0, bad = 0; const check = (ok, msg) => { n++; if (!ok) { bad++; console.log("FAIL " + msg); } };

const pkg = rd("package.json"), lock = rd("package-lock.json"), direct = { ...pkg.dependencies, ...pkg.devDependencies };
for (const [k, v] of Object.entries(direct)) check(/^\d+\.\d+\.\d+$/.test(v), `pin: ${k}@${v} is not an exact version`);
check(fs.existsSync(path.join(W, ".npmrc")) && /^ignore-scripts=true$/m.test(fs.readFileSync(path.join(W, ".npmrc"), "utf8")), "npmrc: web/.npmrc must set ignore-scripts=true (no install-time scripts)");
const root = lock.packages[""];
for (const s of ["dependencies", "devDependencies"]) check(JSON.stringify(root[s] || {}) === JSON.stringify(pkg[s] || {}), `lockfile: ${s} differ from package.json (run npm install)`);
for (const [p, m] of Object.entries(lock.packages)) if (p && !m.link) {
  check(!!m.integrity && !!m.resolved?.startsWith("https://registry.npmjs.org/"), `lockfile: ${p} lacks integrity or registry URL`);
  const f = path.join(W, p, "package.json"); if (!fs.existsSync(f)) continue; // optional package for another platform
  const j = JSON.parse(fs.readFileSync(f, "utf8")), lic = typeof j.license === "string" ? j.license : j.license?.type;
  check(okLic(lic) || EXCEPT.test(p), `license: ${p} ${lic || "none"}`);
}
// Unused: a direct dependency no source, script or config file imports.
const files = ["vite.config.js", "build-index.mjs", "eval.mjs", "index.html"].map((f) => path.join(W, f));
for (const d of ["src", "scripts", "e2e"]) for (const f of fs.readdirSync(path.join(W, d), { recursive: true })) if (/\.(m?js|jsx|css)$/.test(f)) files.push(path.join(W, d, f));
const src = files.filter(fs.existsSync).map((f) => fs.readFileSync(f, "utf8")).join("\n");
for (const k of Object.keys(direct)) check(src.includes(`"${k}`) || src.includes(`'${k}`), `unused: ${k} is not imported anywhere`);
let a; try { a = JSON.parse(execSync("npm audit --json", { cwd: W, stdio: ["ignore", "pipe", "ignore"] })); } catch (e) { a = JSON.parse(e.stdout); }
const v = a.metadata.vulnerabilities; check(!v.high && !v.critical, `audit: ${v.high} high, ${v.critical} critical`);
console.log(`${n} checks, ${bad} FAIL (audit: ${v.total} total)`); process.exit(bad ? 1 : 0);
