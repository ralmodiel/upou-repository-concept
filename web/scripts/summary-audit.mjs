// Summary audit (run in web/): node scripts/summary-audit.mjs [--list]
// Each AI summary (half/one/two) vs its source (title, abstract, full-text passages): lengths in range and ordered
// half < one < two; every number in a summary appears in the source (no invented numbers). Prints "N checks, M FAIL"; exit 1 on FAIL.
import fs from "node:fs"; import path from "node:path";
const dir = path.resolve(import.meta.dirname, "../public/index"), J = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const arts = J("articles.json"), chunks = J("chunks.json"), pass = J("passages.json");
const src = new Map(); chunks.forEach((id, i) => src.set(id, (src.get(id) || "") + " " + (pass[i]?.[1] || "")));
export const nums = (s) => (s.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) || []).map((x) => x.replace(/,/g, "").replace(/\.0+$/, ""));
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const RANGE = { half: [120, 400], one: [250, 750], two: [450, 1400] };
console.assert(nums("1,240 sessions, 86% and 2019/2020, 3.50").join() === "1240,86,2019,2020,3.50", "nums self-check");
let n = 0, bad = 0; const list = process.argv.includes("--list");
const check = (fails, msg) => { n++; if (fails.length) bad++; console.log(`${fails.length ? "FAIL" : "ok  "} ${msg}${fails.length ? ` (${fails.length}: ${fails.slice(0, list ? 999 : 5).join(", ")})` : ""}`); };
for (const k of ["half", "one", "two"]) check(arts.filter((a) => { const w = words(a[k] || ""); return w < RANGE[k][0] || w > RANGE[k][1]; }).map((a) => `${a.id}:${words(a[k] || "")}w`), `${k} length ${RANGE[k].join("-")} words`);
check(arts.filter((a) => !(words(a.half) < words(a.one) && words(a.one) < words(a.two))).map((a) => a.id), "half < one < two");
for (const k of ["half", "one", "two"]) check(arts.flatMap((a) => {
  const text = `${a.title} ${a.abstract} ${(a.authors || []).join(" ")} ${a.issue?.label} ${src.get(a.id) || ""}`;
  const have = new Set(nums(text)); nums(text).forEach((y) => have.add(String(Math.round(+y))));  // 61.18% may be summarised as 61%
  // "21 – 30 thousand" -> 21000, 30000
  for (const m of text.matchAll(/(\d+)(?:\s*[–-]\s*(\d+))?\s*thousand/gi)) [m[1], m[2]].filter(Boolean).forEach((y) => have.add(String(+y * 1000)));
  return [...new Set(nums(a[k] || ""))].filter((x) => !have.has(x) && !have.has(String(+x))).map((x) => `${a.id}:${x}`);
}), `${k}: every number appears in the source`);
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
