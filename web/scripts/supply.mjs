// Supply-chain check (round 89): node scripts/supply.mjs <sbom.cdx.json>   (npm sbom --sbom-format cyclonedx > f; full tree: --omit dev drops packages shared with dev deps)
// SBOM is CycloneDX, lists every runtime package of the lockfile, each with a purl and a licence on deps.mjs's allow-list
// (LGPL sharp-libvips excepted: Node-only, never shipped); CI installs with --ignore-scripts and attests provenance.
import fs from "fs"; import path from "path";
const web = path.join(import.meta.dirname, ".."), f = process.argv[2] || "dist/sbom.cdx.json";
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; console.log(`${c ? "PASS" : "FAIL"} ${m} ${x}`); if (!c) bad++; };
const src = fs.readFileSync(path.join(web, "scripts/deps.mjs"), "utf8"), ALLOW = new Set(eval(src.match(/const ALLOW = new Set\((\[[^\]]*\])\)/)[1]));
const okLic = (l) => !!l && l.replace(/[()]/g, "").split(/\s+OR\s+/).some((alt) => alt.split(/\s+AND\s+/).every((x) => ALLOW.has(x.trim())));
const bom = JSON.parse(fs.readFileSync(f, "utf8")), comps = bom.components || [];
ok("SBOM is CycloneDX", bom.bomFormat === "CycloneDX" && !!bom.specVersion, bom.specVersion);
const lock = JSON.parse(fs.readFileSync(path.join(web, "package-lock.json"), "utf8")).packages;
const run = Object.entries(lock).filter(([k, v]) => k && !v.dev && !v.optional).map(([k, v]) => k.split("node_modules/").pop() + "@" + v.version);
const have = new Set(comps.map((c) => (c.group ? c.group + "/" : "") + c.name + "@" + c.version)), miss = run.filter((x) => !have.has(x));
ok("SBOM lists every runtime lockfile package", !miss.length, `(${run.length} runtime, ${comps.length} in SBOM${miss.length ? "; missing " + miss.slice(0, 3).join(" ") : ""})`);
ok("every component has a purl", comps.every((c) => c.purl));
const lic = (c) => (c.licenses || []).map((l) => l.license?.id || l.license?.name || l.expression).join(" OR ");
const badL = comps.filter((c) => !okLic(lic(c)) && !/sharp-libvips/.test(c.name)).map((c) => c.name + ":" + (lic(c) || "none"));
ok("component licences on the allow-list", !badL.length, badL.slice(0, 4).join(" "));
const ci = fs.readFileSync(path.join(web, "../.github/workflows/pages.yml"), "utf8");
ok("CI installs with npm ci --ignore-scripts", /npm ci --ignore-scripts/.test(ci));
ok("CI attests build provenance", /attest-build-provenance/.test(ci) && /attestations: write/.test(ci));
ok("CI workflow permissions default to none", /^permissions: \{\}/m.test(ci));
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
