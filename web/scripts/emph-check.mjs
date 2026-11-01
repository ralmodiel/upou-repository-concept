// Reading-aid markup check: node scripts/emph-check.mjs
import { emphParts } from "../src/emph.js";
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; console.log(`${c ? "PASS" : "FAIL"} ${m} ${x}`); if (!c) bad++; };
const p = emphParts('Online learning helps. The study found that online learning raised scores. Some "distance learners" used Open Educational Resources (OER) (the rest).', ["online learning"]);
const k = (t) => p.filter(([x]) => x === t).map(([, s]) => s);
ok("bold first mention only", JSON.stringify(k("b")) === '["Online learning"]', k("b"));
ok("italic quote and abbreviation, not (the rest)", JSON.stringify(k("i")) === '["\\"distance learners\\"","(OER)"]', JSON.stringify(k("i")));
ok("underline the finding", k("u").length === 1 && k("u")[0] === "online learning raised scores", k("u"));
ok("text unchanged", p.map(([, s]) => s).join("") === 'Online learning helps. The study found that online learning raised scores. Some "distance learners" used Open Educational Resources (OER) (the rest).');
// a long finding ends at a clause boundary (comma) after 60 characters, not mid-clause at a fixed 160; a decimal point is not a sentence end
const L = "Results show that learners who completed 3.5 more modules joined the weekly live sessions and used the course forum, whatever their programme or year level, and reported higher satisfaction with the course, while the others dropped out early. Next.";
const u = emphParts(L).filter(([x]) => x === "u").map(([, s]) => s)[0] || "";
ok("long finding ends at a clause boundary", u.length >= 60 && u.length <= 160 && u.includes("3.5") && L[L.indexOf(u) + u.length] === "," && emphParts(L).map(([, s]) => s).join("") === L, JSON.stringify(u));
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
