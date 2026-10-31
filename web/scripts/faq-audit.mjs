// FAQ audit. Usage: node web/scripts/faq-audit.mjs [data/faqs3.jsonl]  (run from repo root)
// 1) "N articles, M below 14, K missing page/paragraph" over the generated FAQs.
// 2) Support: every shipped FAQ (web/public/index/faqs.json) must carry an LLM-judge verdict (faq_judge.py -> data/faq-judge.jsonl)
//    against its cited passage; support rate = yes+partial among shipped, gate >= 95%. 100 judged pairs for a human: data/faq-sample.tsv.
// Exit 1 if M or K > 0, any shipped FAQ is unjudged, or support < 95%.
import { readFileSync, existsSync } from "node:fs";
const MIN = 14;
const rows = readFileSync(process.argv[2] || "data/faqs3.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
let below = 0, missing = 0;
for (const o of rows) {
  if (o.items.length < MIN) below++;
  missing += o.items.filter((x) => !(x.ref?.page > 0 && x.ref?.para > 0)).length;
}
console.log(`${rows.length} articles, ${below} below ${MIN}, ${missing} missing page/paragraph`);
const J = "data/faq-judge.jsonl", judged = new Map(existsSync(J) ? readFileSync(J, "utf8").split("\n").filter(Boolean).map((l) => { const j = JSON.parse(l); return [j.article + "\u0000" + j.q, j.verdict]; }) : []);
const all = [...judged.values()], shipped = JSON.parse(readFileSync("web/public/index/faqs.json", "utf8")).map((f) => judged.get(f.article + "\u0000" + f.q));
const rate = (v) => v.filter((x) => x === "yes" || x === "partial").length / Math.max(1, v.length);
const unjudged = shipped.filter((x) => !x).length, sup = rate(shipped.filter(Boolean));
console.log(`judge: all ${all.length} generated ${(100 * rate(all)).toFixed(1)}% supported (yes ${all.filter((x) => x === "yes").length}); shipped ${shipped.length}: ${(100 * sup).toFixed(1)}% supported, ${unjudged} unjudged`);
const fail = below || missing || rows.length < 116 || unjudged || sup < 0.95;
console.log(fail ? "1 FAIL" : "0 FAIL"); process.exit(fail ? 1 : 0);
