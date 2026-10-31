// Faculty gate: node scripts/faculty_check.mjs  (no browser). Schema of every file (examples too), no emails/phones, slugs unique, alias collisions,
// IJODeL snapshot (URL pattern, no PDF links), every attached article lists the person by the alias rules, and merge fixtures
// (surname change, redirect target, title not in the key, not_same_as split). Prints "N checks, M FAIL" and the IJODeL counts; exit 1 on FAIL.
import { readFileSync, readdirSync } from "fs";
import { FAC, validate, crossCheck, load, nameKey, sameKey } from "./faculty-lib.mjs";
import { mergePeople } from "./people-merge.mjs";
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; if (!c) { bad++; console.log(`FAIL ${m} ${x}`); } };
const W = new URL("..", import.meta.url).pathname, rd = (p) => JSON.parse(readFileSync(W + p, "utf8"));
const all = readdirSync(FAC).filter((f) => f.endsWith(".json") && !f.startsWith("ijodel-")).map((f) => ({ file: f, data: rd("public/faculty/" + f) }));
for (const f of all) { const e = validate(f.data); ok(`${f.file} schema`, !e.length, e.join("; ")); }
const real = load().files; const cc = crossCheck(real); ok("slugs unique, no name/alias belongs to two people", !cc.length, cc.join("; "));
{ const dup = crossCheck([{ file: "a.json", data: { slug: "a-b", name: "Ann Lee", former_names: ["Ann Lim"] } }, { file: "b.json", data: { slug: "c-d", name: "Cy Dee", aliases: ["Ann Lim"] } }]); ok("alias collision is caught and names both files", dup.length === 1 && /a\.json/.test(dup[0]) && /b\.json/.test(dup[0]), dup.join()); }
{ const v = (o) => validate({ slug: "x-y", name: "Xa Yo", ...o }).length; ok("email, phone, link and bad title rejected", v({ notes: "mail me at a@b.com" }) && v({ notes: "call 0917 123 4567" }) && v({ notes: "see https://x.org" }) && v({ title: "x".repeat(31) }) && v({ name: "Dr. Xa Yo" }) && v({ status: "boss" }) && v({ zzz: 1 }) && !v({ title: "Dr.", status: "new" })); }
// IJODeL snapshot
const ij = rd("public/faculty/ijodel-articles.json"), URLRE = /^https:\/\/ijodel\.upou\.edu\.ph\/ijodel\/article\/view\/\d+$/;
ok(`${ij.length} IJODeL articles: URL is exactly article/view/<digits>`, ij.every((a) => URLRE.test(a.url) && !/pdf/i.test(a.url)), ij.find((a) => !URLRE.test(a.url))?.url);
ok("snapshot has only the minimal fields", ij.every((a) => Object.keys(a).sort().join() === "authors,categories,id,subjects,title,url,year"));
const pe = rd("public/index/people.json"), byId = new Map(ij.map((a) => [a.id, a])); let attached = 0, wrong = [];
for (const p of pe) for (const id of p.ij || []) { attached++; const a = byId.get(id);   const forced = (p.ijf || []).includes(id); const keys = [p.n, ...(p.legal ? [p.legal] : []), ...(p.fn || [])].map(nameKey).filter(Boolean);
  if (!a || (!forced && !a.authors.some((au) => keys.some((k) => sameKey(k, nameKey(au), true))))) wrong.push(p.n + " " + id); }
ok(`${attached} attached IJODeL articles list the person among their authors`, !wrong.length, wrong.slice(0, 3).join(", "));
const adv = pe.filter((p) => p.adv.length), withIj = pe.filter((p) => p.ij?.length);
console.log(`IJODeL: ${withIj.length} people have IJODeL articles, of whom ${withIj.filter((p) => p.adv.length).length} are advisers (of ${adv.length} advisers); ${attached} articles attached of ${ij.length}`);
// merge fixtures
const base = [{ n: "Maria Santos", s: "maria-santos", adv: ["1", "2"], aut: [], v: [{ n: "Maria Santos", adv: ["1", "2"], aut: [] }] }, { n: "Mario Santos", s: "mario-santos", adv: ["3"], aut: [], v: [{ n: "Mario Santos", adv: ["3"], aut: [] }] },
  { n: "Maria Santos-Reyes", s: "maria-santos-reyes", adv: ["4"], aut: [], v: [{ n: "Maria Santos-Reyes", adv: ["4"], aut: [] }] }, { n: "Joe Bo", s: "joe-bo", adv: [], aut: [], v: [{ n: "Joe Bo", adv: [], aut: [] }, { n: "Joel Bo", adv: [], aut: [] }] }];
const file = { file: "m.json", data: { slug: "maria-santos-reyes", name: "Maria Santos-Reyes", title: "Dr.", former_names: ["Maria Santos"], corrections: "Surname changed", status: "active" } };
const ijf = [{ id: "7", authors: ["Santos, Maria"] }];
const m = mergePeople(base, [file], ijf), P = m.people.find((p) => p.s === "maria-santos-reyes");
ok("surname change: old-name theses join the new page", P && ["1", "2", "4"].every((i) => P.adv.includes(i)) && !m.people.some((p) => p.s === "maria-santos"));
ok("old slug is kept as a redirect source", P?.os?.includes("maria-santos"));
ok("title is shown but not in the matching key", P?.ti === "Dr." && !P.n.includes("Dr") && JSON.stringify(nameKey("Dr. Maria Santos-Reyes")) === JSON.stringify(nameKey("Maria Santos-Reyes")));
ok("IJODeL article under the old surname joins the person; a different Mario is untouched", P?.ij?.includes("7") && !m.people.find((p) => p.s === "mario-santos").ij);
{ const s = mergePeople([{ n: "Ana Cruz", s: "ana-cruz", adv: ["1"], aut: [], v: [{ n: "Ana Cruz", adv: ["1"], aut: [] }, { n: "Anna Cruz", adv: ["2"], aut: [] }] }], [{ file: "s.json", data: { slug: "ana-cruz", name: "Ana Cruz", not_same_as: ["Anna Cruz"] } }], []);
  ok("not_same_as splits a wrong auto-merge", s.people.length === 2 && s.people.find((p) => p.s === "ana-cruz").adv.join() === "1" && s.report.split.length === 1); }
{ const a = mergePeople([{ n: "Ann Lee", s: "ann-lee", adv: [], aut: [], v: [{ n: "Ann Lee", adv: [], aut: [] }] }, { n: "Anne Lee", s: "anne-lee", adv: [], aut: [], v: [{ n: "Anne Lee", adv: [], aut: [] }] }], [], [{ id: "5", authors: ["Lee, A."] }, { id: "6", authors: ["Lee, Ann"] }]);
  ok("ambiguous initial is left unmerged, full first name is merged", a.report.ambiguous.length === 1 && !a.people.some((p) => p.ij?.includes("5")) && a.people.find((p) => p.s === "ann-lee").ij?.join() === "6"); }
ok("accents and Dela Pena variants match", sameKey(nameKey("Maria Dela Peña"), nameKey("Dela Pena, Maria")) && sameKey(nameKey("José Ñ. Reyes"), nameKey("Reyes, Jose")));
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
