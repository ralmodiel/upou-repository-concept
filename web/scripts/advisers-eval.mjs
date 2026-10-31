// Script-computed checks of the /advisers logic on the real data (public/index) and fixtures. Prints one JSON object; used by ../adviser_check.py.
import { readFileSync } from "fs";
import { makeCtx, buildPeople, analyze, panel, subUniverse, discover, badge, badges, canChair, ijScore } from "../src/advisers.js";
import { W, CAP, contrib, trackRaw } from "../src/scoring.js";
const rd = (f) => JSON.parse(readFileSync(new URL("../public/index/" + f, import.meta.url)));
const norm = (a) => { a.year = +a.year || 0; for (const k of ["authors", "subjects", "categories", "subtopics", "advisers"]) a[k] = a[k] || []; a.abstract ||= ""; return a; };
const arts = rd("articles.json").map(norm), raw = rd("people.json"), ctx = makeCtx(arts), ij = JSON.parse(readFileSync(new URL("../public/faculty/ijodel-articles.json", import.meta.url))).map((a) => ({ ...a, year: +a.year || 0 })), intl = rd("international.json").items;
const people = buildPeople(raw, arts, ctx.lastYear, { ij, intl }), plain = buildPeople(raw, arts, ctx.lastYear), // plain = repository advisees and own articles only (the scoring before the evidence mix)
  out = { lastYear: ctx.lastYear, problems: [] };
const bad = (m) => out.problems.push(m);
// 1 fixture: badge only when the latest advisee year is earlier than the data's latest year; people without advisees get the other label
{ const fx = [{ id: "1", year: 2020 }, { id: "2", year: 2023 }, { id: "3", year: 2024 }].map((a) => ({ title: "t", abstract: "", subjects: [], subtopics: [], categories: [], ...a }));
  const f = buildPeople([{ n: "A B", s: "a-b", adv: ["1", "2"], aut: [] }, { n: "C D", s: "c-d", adv: ["3"], aut: [] }, { n: "E F", s: "e-f", adv: ["1"], aut: ["2"] }, { n: "G H", s: "g-h", adv: [], aut: ["2"] }], fx, 2024);
  const got = f.list.map((p) => badge(p, 2024)); const want = ["No advisee in 2024", "", "No advisee in 2024", "Has not advised in this repository"];
  out.fixture = JSON.stringify(got) === JSON.stringify(want); if (!out.fixture) bad("fixture badge " + JSON.stringify(got)); }
// 2 held-out thesis titles: the thesis is hidden from every profile; its own adviser should be in the top 3
const advised = arts.filter((a) => a.advisers.length), step = Math.floor(advised.length / 60);
const held = Array.from({ length: 60 }, (_, i) => advised[i * step]);
let h3 = 0; held.forEach((a) => { const r = analyze(people, ctx, [{ k: "text", v: a.title }], { skip: a.id }).slice(0, 3).map((x) => x.p.name); if (a.advisers.some((n) => r.includes(n))) h3++; });
out.heldout = { queries: held.length, hit3: +(h3 / held.length).toFixed(2) };
// 3 sub-topic queries: expected = the 3 people with most advised items on it (computed from the data)
const sc = new Map(); advised.forEach((a) => a.subtopics.forEach((s) => sc.set(s, (sc.get(s) || 0) + 1)));
const subs = [...sc].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map((z) => z[0]);
let s3 = 0; subs.slice(0, 15).forEach((s) => { const cnt = new Map(); advised.filter((a) => a.subtopics.includes(s)).forEach((a) => a.advisers.forEach((n) => cnt.set(n, (cnt.get(n) || 0) + 1)));
  const want = [...cnt].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0], top = analyze(people, ctx, [{ k: "subtopic", v: s }]).slice(0, 3).map((x) => x.p.name); if (top.includes(want)) s3++; });
const advOnly = buildPeople(raw.map((p) => ({ ...p, aut: [], ij: [], own: [] })), arts, ctx.lastYear); let s3a = 0; // advisee evidence alone: the old metric, must stay >= 0.9
subs.slice(0, 15).forEach((s) => { const cnt = new Map(); advised.filter((a) => a.subtopics.includes(s)).forEach((a) => a.advisers.forEach((n) => cnt.set(n, (cnt.get(n) || 0) + 1)));
  const want = [...cnt].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0]; if (analyze(advOnly, ctx, [{ k: "subtopic", v: s }]).slice(0, 3).some((x) => x.p.name === want)) s3a++; });
out.subtopic = { queries: 15, hit3: +(s3 / 15).toFixed(2), hit3AdviseesOnly: +(s3a / 15).toFixed(2) };
// 4 multi-topic combos (2-4 sub-topics, rotating through the frequent ones): the panel covers every topic that anyone covers
let pool = 0, cov = 0, combos = 0, dup = 0, noSub = 0;
for (let c = 0; c < 10; c++) { const n = 2 + (c % 3), tp = Array.from({ length: n }, (_, i) => ({ k: "subtopic", v: subs[(c * 2 + i * 3) % Math.min(subs.length, 20)] }));
  if (new Set(tp.map((t) => t.v)).size < n) continue; combos++;
  const rows = analyze(people, ctx, tp), pn = panel(rows, tp, subUniverse(ctx, arts, tp), { size: n > 3 ? 4 : 3 });
  const poolT = tp.filter((_, t) => rows.some((r) => r.per[t].covered)).length; pool += poolT; cov += poolT - pn.uncovered.filter((t) => rows.some((r) => r.per[t].covered)).length;
  if (new Set(pn.members.map((m) => m.row.p.i)).size !== pn.members.length) dup++;
  if (pn.uncovered.some((t) => rows.some((r) => r.per[t].covered))) bad("combo " + tp.map((t) => t.v).join("+") + " panel misses a coverable topic");
  const sub = pn.members.map((m) => new Set(m.newSubs)); if (pn.members.length < (n > 3 ? 4 : 3)) noSub++; }
out.multi = { combos, coverage: +(cov / pool).toFixed(2), duplicateMembers: dup, shortPanels: noSub };
// 5 discovery: counts recomputed independently
let dn = 0; subs.slice(0, 10).forEach((s) => { const d = discover(ctx, arts, { k: "subtopic", v: s }), m = arts.filter((a) => a.subtopics.includes(s));
  if (d.n !== m.length) bad("discover n " + s);
  d.tags.forEach(([t, n, y]) => { const k = m.filter((a) => a.subjects.includes(t) || a.subtopics.includes(t)); if (k.length !== n || Math.max(...k.map((a) => a.year)) !== y) bad(`tag count ${s}/${t}`); dn++; });
  d.gaps.forEach(([a, b, , , n]) => { const k = m.filter((x) => (x.subjects.includes(a) || x.subtopics.includes(a)) && (x.subjects.includes(b) || x.subtopics.includes(b))).length; if (k !== n || n > 1) bad(`gap ${a}/${b}`); dn++; }); });
out.discovery = { checked: dn };
// 6 weight order (fixtures): international > own > advisee at equal counts; log-capped; recency; chair = track record
{ const A = (id, y, st = "") => ({ id, year: y, title: "alpha topic", abstract: "", subjects: [], subtopics: ["T"], categories: [] }), fx = [A("a1", 2024), A("a2", 2024), A("a3", 2024), A("a4", 2024), A("o1", 2024), A("i1", 2024), A("old1", 2015), A("old2", 2015), A("new1", 2024)];
  const fctx = makeCtx(fx), mk = (n, o) => ({ n, s: n, adv: [], aut: [], ...o }), topic = [{ k: "subtopic", v: "T" }];
  const ijx = [{ id: "5", title: "alpha", year: 2024, subjects: [], categories: ["T"], subtopics: ["T"] }];
  const raw2 = [mk("ADV", { adv: ["a1"] }), mk("OWN", { aut: ["o1"] }), mk("INTL", { aut: ["i1"], ii: ["i1"] }), mk("IJ", { ij: ["5"] }), mk("ADVMANY", { adv: ["a1", "a2", "a3", "a4"] }), mk("NOTINTL", { aut: ["i1"], ii: ["i1"], ni: ["i1"] })];
  const pp = buildPeople(raw2, fx, 2024, { ij: ijx, intl: {} }), sc = Object.fromEntries(analyze(pp, fctx, topic, { all: true }).map((r) => [r.p.name, r.per[0].lex]));
  if (!(sc.INTL > sc.OWN && sc.OWN > sc.ADV)) bad("weight order intl > own > advisee at equal counts: " + JSON.stringify(sc));
  if (!(sc.IJ > sc.OWN)) bad("IJODeL article (international) should outweigh an own work: " + JSON.stringify(sc));
  if (sc.NOTINTL !== sc.OWN) bad("not_international override should make an international own work an ordinary own work");
  if (!(sc.ADVMANY > sc.ADV && sc.ADVMANY <= W.adv + 1e-9)) bad("advisee source must grow with count but stay capped at its weight");
  if (!(contrib(1e6, "adv") <= W.adv + 1e-9 && W.intl > W.own && W.own > W.adv)) bad("log cap / weight constants");
  // chair: equal topic match, more and more recent advising wins; new and former never chair unless includeFormer
  const cx = (n, ids, st) => mk(n, { adv: ids, st });
  const ch = buildPeople([cx("MORE", ["a1", "a2", "a3"]), cx("LESS", ["a4"]), cx("OLDER", ["old1", "old2", "new1"].slice(0, 2)), cx("NEWF", [], "new"), cx("FORMER", ["a1", "a2", "a3", "a4"], "former")], fx, 2024);
  const rows = analyze(ch, fctx, topic, { all: true }), by = Object.fromEntries(rows.map((r) => [r.p.name, r]));
  if (!(by.MORE.chair > by.LESS.chair)) bad("chair: more advising should beat less at equal match");
  if (!(by.LESS.chair > by.OLDER.chair || by.LESS.p.trackN > by.OLDER.p.trackN)) bad("chair: recent advising should beat older at equal count");
  const pm = panel(rows, topic, [], { size: 3 }); if (pm.members[0].row.p.name === "FORMER" || pm.members.some((m) => m.row.p.name === "FORMER")) bad("former faculty in a suggested panel without includeFormer");
  if (!panel(rows, topic, [], { size: 3, includeFormer: true }).members.some((m) => m.row.p.name === "FORMER")) bad("includeFormer should allow former faculty");
  if (canChair(by.NEWF.p) || canChair(by.FORMER.p) || !canChair(by.MORE.p)) bad("chair eligibility");
  if (badges(by.FORMER.p, 2024)[0] !== "No longer connected to the university" || badges(by.NEWF.p, 2024)[0] !== "New faculty, no advised theses yet") bad("status badges");
  out.weights = sc; }
// 6b round 54: new faculty without theses are scored by BM25 over expertise text + keywords; external people are badged and kept out of panels unless asked; weights above are unchanged
{ const A = (id, t, st) => ({ id, year: 2024, title: t, abstract: "", subjects: [], subtopics: st, categories: [] }), fx = [A("a1", "mangrove ecology survey", ["Ecology"]), A("a2", "mobile learning design", ["EdTech"]), A("a3", "assessment rubric", ["Assessment"])], fctx = makeCtx(fx);
  const mk = (n, o) => ({ n, s: n.toLowerCase(), adv: [], aut: [], ...o }), topic = (v, k = "text") => [{ k, v }];
  const pp = buildPeople([mk("OLD", { adv: ["a1", "a2"] }), mk("NEWBIE", { st: "new", ex: ["machine learning for crop disease detection", "remote sensing"], exT: [{ k: "subtopic", v: "EdTech" }] }), mk("NEWOTHER", { st: "new", ex: ["early childhood literacy"] }), mk("EXT", { st: "external", adv: ["a3"] })], fx, 2024);
  const top = (v, k) => analyze(pp, fctx, topic(v, k), { all: true }).filter((r) => r.covN).map((r) => r.p.name);
  const t1 = top("crop disease detection with machine learning"), t2 = top("literacy of young children"), t3 = top("EdTech", "subtopic");
  if (t1[0] !== "NEWBIE" || t1.includes("NEWOTHER")) bad("new faculty BM25: expected NEWBIE alone for its expertise topic, got " + JSON.stringify(t1));
  if (t2[0] !== "NEWOTHER") bad("new faculty BM25: expected NEWOTHER for literacy, got " + JSON.stringify(t2));
  if (!t3.includes("NEWBIE")) bad("new faculty: structured expertise topic should match");
  if (analyze(pp, fctx, topic("mangrove ecology")).some((r) => r.p.name === "NEWBIE")) bad("new faculty must not match unrelated topics");
  const rows = analyze(pp, fctx, topic("assessment rubric"), { all: true });
  if (badges(rows.find((r) => r.p.name === "EXT").p, 2024)[0] !== "External") bad("external badge");
  if (panel(rows, topic("assessment rubric"), [], { size: 3 }).members.some((m) => m.row.p.name === "EXT")) bad("external person in a panel without the toggle");
  if (!panel(rows, topic("assessment rubric"), [], { size: 3, includeFormer: true }).members.some((m) => m.row.p.name === "EXT")) bad("include toggle should allow external people");
  if (canChair(rows.find((r) => r.p.name === "EXT").p)) bad("external person must not chair by default");
  out.newFaculty = { newbieFirst: t1[0] === "NEWBIE", otherFirst: t2[0] === "NEWOTHER" }; }
// 7 real data: how many people the international boost touches, whether rankings change, chair vs plain top-ranked person over 10 combos
{ const touched = people.list.filter((p) => p.intlIds.size || p.ij.length), flagged = people.list.filter((p) => p.intlIds.size).length;
  let rankChanged = 0, top3Changed = 0, chairDiff = 0, combos = 0, hits = 0, plainHits = 0;
  for (let c = 0; c < 10; c++) { const n = 2 + (c % 3), tp = Array.from({ length: n }, (_, i) => ({ k: "subtopic", v: subs[(c * 2 + i * 3) % Math.min(subs.length, 20)] })); if (new Set(tp.map((t) => t.v)).size < n) continue; combos++;
    const a = analyze(people, ctx, tp), b = analyze(plain, ctx, tp), key = (r, k) => r.slice(0, k).map((x) => x.p.name).join("|");
    if (key(a, 10) !== key(b, 10)) rankChanged++; if (key(a, 3) !== key(b, 3)) top3Changed++;
    const pn = panel(a, tp, subUniverse(ctx, arts, tp), { size: 3 }); if (pn.members[0] && a[0] && pn.members[0].row.p.name !== a[0].p.name) chairDiff++; }
  out.international = { peopleWithIntl: touched.length, withFlaggedRepoItem: flagged, withIjodel: people.list.filter((p) => p.ij.length).length, combos, top10Changed: rankChanged, top3Changed, chairDiffersFromTopRanked: chairDiff };
  const chk = raw.filter((p) => p.ij?.length).length; out.ijodel = { peopleWithIjodel: chk, advisersWithIjodel: raw.filter((p) => p.ij?.length && p.adv.length).length }; }
// 8 rounds 150-151: a year-less advisee is skipped by trackRaw (not counted as the newest year); a panel never repeats a person, whatever is fixed or toggled
{ const A = (id, y) => ({ id, year: y, title: "alpha topic", abstract: "", subjects: [], subtopics: ["T"], categories: [] }), fx = [A("a1", 2020), A("a2", 2021), A("a3", 2022), A("a4", 2023)], mk = (n, o) => ({ n, s: n, adv: [], aut: [], ...o });
  if (trackRaw([2020, undefined, 0], 2024) !== trackRaw([2020], 2024)) bad("R150 year-less advisee must not count as the newest year");
  const pp = buildPeople(["a1", "a2", "a3", "a4"].map((id, i) => mk("P" + i, { adv: [id], st: i === 3 ? "former" : "" })).concat([mk("P4", { adv: ["a1", "a2"] })]), fx, 2024), c2 = makeCtx(fx);
  for (let k = 0; k < 50; k++) for (const inc of [false, true]) { const tp = [{ k: "subtopic", v: "T" }, { k: "text", v: ["alpha", "topic", "zzz"][k % 3] }], rows = analyze(pp, c2, tp, { all: true }), fixed = k % 2 ? [rows[k % rows.length]] : [];
    const ids = panel(rows, tp, [], { size: 4, fixed, includeFormer: inc }).members.map((m) => m.row.p.i); if (new Set(ids).size !== ids.length) { bad("R151 panel repeats a person " + ids); break; } } }
console.log(JSON.stringify(out));
