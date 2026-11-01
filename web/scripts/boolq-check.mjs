// Boolean query parser, matcher and chips (brief §4 queries, bracket degrade, 2000+ characters): node scripts/boolq-check.mjs
import { parseBool, matchBool, toChips } from "../src/boolq.js";
let n = 0, bad = 0; const ok = (m, c, x = "") => { n++; if (!c) { bad++; console.log(`FAIL ${m} ${x}`); } };
const D = ["Online learning at home", "The online course and learning outcomes", "Gamification raised engagement in distance education",
  "Game-based learning for nurses", "Learners and learning analytics", "Nurses' burnout in the Philippines", "Participatory video with farmers"];
const hits = (q) => D.map((d, i) => matchBool(parseBool(q).ast, d) ? i : -1).filter((i) => i >= 0).join();
ok("phrase", hits('"online learning"') === "0", hits('"online learning"'));
ok("OR is a union", hits('gamification OR "game-based learning"') === "2,3", hits('gamification OR "game-based learning"'));
ok("grouping with AND", hits('("distance education" OR "online learning") AND engagement') === "2");
ok("prefix", hits("learn*") === "0,1,3,4", hits("learn*"));
ok("AND of three, accents and case", hits("NURSES AND burnout AND Philippines") === "5" && hits("Philippinés") === "5");
ok("upper case words = lower case", hits("ONLINE LEARNING") === hits("online learning") && hits("online learning") === "0,1");
ok("zero is zero", hits('"participatory video" AND "smallholder farmers"') === "");
ok("NOT and -", hits("learning NOT online") === "3,4" && hits("learning -online") === "3,4" && hits(`learning -"online course"`) === "0,3,4", hits("learning NOT online"));
ok("hyphen word is a phrase", hits("game-based") === "3" && hits("e-learning") === "");
ok("plain flag", parseBool("online learning").plain && !parseBool('"online learning"').plain && !parseBool("a OR b").plain);
// degrade: brackets and stray operators never zero the count, and say so
const u = parseBool('("distance education" OR "online learning" AND engagement');
ok("unbalanced bracket degrades with a note", /unbalanced brackets/.test(u.note) && hits('("distance education" OR "online learning" AND engagement') === "2", u.note);
ok("stray operators and field tags", hits("OR online AND learning NOT") === "0,1" && hits("gamification OR OR nurses") === "2,3,5" && /stray/.test(parseBool("OR online").note) && hits("title:gamification[tiab]") === "2");
ok("no note for good syntax", parseBool('(a OR "b c") AND d* -e').note === "");
ok("empty query matches all", parseBool("").ast === null && matchBool(null, "x") && parseBool(") ( ").ast === null);
// chips: Required = first term of each AND block, Expand = its OR synonyms, Exclude = NOT; phrases keep quotes
const c = toChips(parseBool('("distance education" OR "online learning") AND (engagement OR motivation) NOT mooc* -(x AND y)').ast);
ok("toChips", JSON.stringify(c) === JSON.stringify({ req: [{ k: "words", v: '"distance education"', l: '"distance education"' }, { k: "words", v: "engagement", l: "engagement" }],
  exp: [{ k: "words", v: '"online learning"', l: '"online learning"' }, { k: "words", v: "motivation", l: "motivation" }], exc: [{ k: "words", v: "mooc*", l: "mooc*" }, { k: "words", v: "x AND y", l: "x AND y" }] }), JSON.stringify(c));
// 2000+ characters: the brief's PICO string repeated, read whole and fast; hostile 100k inputs stay fast
const pico = '("learners in online distance education" OR "distance education" OR "online learning" OR e-learning) AND ("gamified learning activities" OR gamification OR "game-based learning" OR "serious games") AND ("learner engagement" OR engagement OR motivation OR participation)';
const long = Array.from({ length: 8 }, () => pico).join(" AND "), t0 = performance.now(), L = parseBool(long);
ok("2000+ characters read whole", long.length > 2000 && L.note === "" && L.ast.c.length === 24 && matchBool(L.ast, D[2] + " online learning motivation"), long.length);
ok("2000+ characters fast", performance.now() - t0 < 50);
for (const h of ["(", '"', "NOT ", "-", "a OR ", "*", "(a ", ")"]) { const q = h.repeat(Math.ceil(1e5 / h.length)), t = performance.now(), r = parseBool(q); matchBool(r.ast, D.join(" ")); const ms = performance.now() - t; ok(`hostile ${JSON.stringify(h)} < 200 ms`, ms < 200, Math.round(ms) + " ms"); }
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
