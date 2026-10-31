// Related-reading audit (run in web/): node scripts/related-audit.mjs [--list]
// Each "why" note on a related pair (a -> b) must be grounded: it has a note, most of its topic words occur in b
// (title, abstract, summary, tags). Notes with weak coverage or no word shared by a and b are listed for an editor.
// Prints "N checks, M FAIL" (+ weakest notes); exit 1 on FAIL.
import fs from "node:fs"; import path from "node:path";
import { recommend } from "../src/recommend.js";
const arts = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../public/index/articles.json"), "utf8"));
const by = new Map(arts.map((a) => [a.id, a]));
const STOP = new Set("also both from have into more that this than then were what when with work about across among article articles author authors based between builds building complements complementing context contexts discussed discusses discussion examines examining explores exploring expands extends extending focus focuses further insights journal journals lead offers offering paper perspective piece provides providing related research shared shares similar specifically studies study theme themes these those through topic which while within would their there other another broader issue articles's".split(" "));
// crude stem so "learners"/"learning"/"learned" meet
const stem = (w) => w.replace(/(ingly|edly|ings|ing|ers|ies|ied|ed|es|s|al|ally)$/, "").slice(0, 7);
const terms = (s) => new Set((s.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOP.has(w)).map(stem));
const text = (a) => terms(`${a.title} ${a.abstract} ${a.half} ${(a.subjects || []).join(" ")} ${(a.categories || []).join(" ")}`);
console.assert(stem("learners") === stem("learning"), "stem self-check");
const T = new Map(arts.map((a) => [a.id, text(a)]));
const list = process.argv.includes("--list"); let n = 0, bad = 0;
const check = (fails, msg) => { n++; if (fails.length) bad++; console.log(`${fails.length ? "FAIL" : "ok  "} ${msg}${fails.length ? ` (${fails.length}: ${fails.slice(0, list ? 999 : 5).join(", ")})` : ""}`); };
const pairs = arts.flatMap((a) => (a.related || []).map((r) => ({ a, b: by.get(r.id), why: r.why || "" })));
const scored = pairs.filter((p) => p.why).map((p) => { const w = [...terms(p.why)]; const inB = w.filter((t) => T.get(p.b.id).has(t)); return { ...p, cov: w.length ? inB.length / w.length : 1, shared: inB.filter((t) => T.get(p.a.id).has(t)) }; });
check(pairs.filter((p) => !p.why.trim()).map((p) => `${p.a.id}->${p.b.id}`), `${pairs.length} related pairs have a why note`);
// shortcut: lexical overlap, not meaning; below 0.25 the note is about some other article (FAIL), 0.25-0.4 is listed for an editor
check(scored.filter((p) => p.cov < 0.25).map((p) => `${p.a.id}->${p.b.id}:${p.cov.toFixed(2)}`), "note topic words found in the related article (>= 25%)");
// no shared topic word is only a hint (synonyms: "cognitive load" vs "self-regulation"), so it is listed, not failed
const weak = scored.filter((p) => p.cov < 0.4 || (!p.shared.length && !/whereas|unlike|contrast|rather than|complement/i.test(p.why)));
if (weak.length) console.log(`note ${weak.length} weak notes for an editor: ${weak.map((p) => p.a.id + "->" + p.b.id).join(" ")}`);
// R241: Recommended never repeats a listed item (seed) or itself twice; checked as one seed per item plus 2-item lists
check(arts.flatMap((a, i) => { const seeds = i % 2 ? [a, arts[(i + 7) % arts.length]] : [a], ids = recommend(seeds, arts).map((r) => r.a.id);
  return seeds.some((s) => ids.includes(s.id)) || new Set(ids).size < ids.length ? [a.id] : []; }), `recommend() leaves out listed items, no repeats (${arts.length} items)`);
const cov = scored.map((p) => p.cov).sort((x, y) => x - y);
console.log(`coverage min ${cov[0]?.toFixed(2)} median ${cov[cov.length >> 1]?.toFixed(2)}`);
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
