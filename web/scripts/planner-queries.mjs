// Topic Planner brief §4 queries against the built index (dist/index, or DIST=<dir> for a scratch build: `npx vite build --outDir <dir>`): node scripts/planner-queries.mjs
// Prints the count per query (the Boolean predicate over every item, all searched fields, as the Search page counts),
// then checks the brief's expectations, the zero-result echo and the bracket degrade. Exits 1 on any FAIL.
import fs from "node:fs";
import { parseBool, matchBool } from "../src/boolq.js";
import { hayOf, countLine, urlEntry } from "../src/query.js";
const rd = (f) => JSON.parse(fs.readFileSync((process.env.DIST || new URL("../dist", import.meta.url).pathname) + "/index/" + f, "utf8"));
const A = rd("articles.json"), T = rd("texts.json"), H = rd("half.json"); for (const a of A) Object.assign(a, T[a.id], { half: H[a.id] }); // abstract, one, two (texts.json) and half (half.json) load apart in the app
const ys = A.map((a) => +a.year), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
const count = (q, from = Y0, to = Y1) => { const b = parseBool(q); return A.filter((a) => +a.year >= from && +a.year <= to && matchBool(b.ast, hayOf(a))).length; };
const PICO = '("learners in online distance education" OR "distance education" OR "online learning" OR e-learning) AND ("gamified learning activities" OR gamification OR "game-based learning" OR "serious games") AND ("learner engagement" OR engagement OR motivation OR participation)';
const Q = ['"online learning"', 'gamification OR "game-based learning"', '("distance education" OR "online learning") AND engagement', "learn*",
  "nurses AND burnout AND Philippines", PICO, '"participatory video" AND "smallholder farmers"', "ONLINE LEARNING"];
const N = Object.fromEntries(Q.map((q) => [q, count(q)]));
console.log(`${A.length} items, ${Y0}–${Y1}`); for (const q of Q) console.log(String(N[q]).padStart(4), q.length > 90 ? q.slice(0, 87) + `… (${q.length} chars)` : q);
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; if (!c) { bad++; console.log(`FAIL ${m} ${x}`); } };
ok("phrase finds records", N[Q[0]] > 0 && N[Q[0]] <= count("online learning"));
ok("OR >= either alone", N[Q[1]] >= count("gamification") && N[Q[1]] >= count('"game-based learning"'));
ok("grouped AND <= the OR group", N[Q[2]] <= count('"distance education" OR "online learning"'));
ok("learn* is a prefix match", N[Q[3]] > count("learn"));
ok("year filter narrows", count(Q[4], 2020, 2021) <= N[Q[4]] && count("online", 2020, 2021) < count("online"));
ok("PICO string read whole, no note", PICO.length > 250 && parseBool(PICO).note === "" && JSON.stringify(parseBool(PICO).ast).includes("participation"));
ok("upper case = lower case", N[Q[7]] === count("online learning"));
const z = countLine(N[Q[6]], Q[6], Y0, Y1);
ok("zero result echoes the query", N[Q[6]] > 0 || z === `0 results for “${Q[6]}” (${Y0}–${Y1})`, z);
const u = '("distance education" OR "online learning" AND engagement', ub = parseBool(u);
ok("unbalanced bracket degrades with a note, same count", /unbalanced/.test(ub.note) && count(u) === N[Q[2]] && N[Q[2]] > 0, `${count(u)} vs ${N[Q[2]]}`);
const e = urlEntry("query=" + encodeURIComponent(PICO) + "&dateFromYear=2018&f.dateIssued.max=2022");
ok("URL entry: query and year aliases", e.q === PICO && e.from === 2018 && e.to === 2022 && urlEntry("q=x&from=2019&to=2020").from === 2019 && urlEntry("q=x").to === null);
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
