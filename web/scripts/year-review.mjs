// Year review (run in web/): node scripts/year-review.mjs
// Lists articles whose year differs from their issue label and has no editor decision in ../data/year-decisions.json.
// Writes ../data/year-review.tsv (id, OJS year, issue year, issue, title) for an editor; prints "N pending". Exit 0 (a human decides).
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const arts = JSON.parse(fs.readFileSync(path.join(root, "web/public/index/articles.json"), "utf8"));
const dec = JSON.parse(fs.readFileSync(path.join(root, "data/year-decisions.json"), "utf8"));
const pend = arts.filter((a) => !a.issue?.label?.includes(a.year) && !dec[a.id]);
const rows = pend.map((a) => [a.id, a.year, a.issue.label.match(/\d{4}$/)?.[0], a.issue.label, a.title].join("\t"));
fs.writeFileSync(path.join(root, "data/year-review.tsv"), ["id\tojs_year\tissue_year\tissue\ttitle", ...rows].join("\n") + "\n");
console.log(`${pend.length} pending year decisions -> data/year-review.tsv`);
process.exit(0);
