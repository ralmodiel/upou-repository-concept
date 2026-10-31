// Large-corpus stress (round 84, run in web/): node scripts/stress.mjs [N=5000]
// Clones the real corpus to N synthetic chapters (new ids, shuffled issue/year), then times engine index build, search0
// (BM25 + did-you-mean, the worker's work) and Advanced run() for 30 queries/setups. Budgets: index build < 3000 ms once,
// search p95 < 200 ms (worker, off the main thread), Advanced run p95 < 50 ms (main thread, ~3 frames). Exit 1 over budget.
import fs from "node:fs"; import path from "node:path";
const N = +(process.argv[2] || 5000), web = path.resolve(import.meta.dirname, ".."), dir = path.join(web, "public/index");
const J = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), base = J("articles.json"), chunks0 = J("chunks.json");
const arts = Array.from({ length: N }, (_, i) => { const a = base[i % base.length]; return { ...a, id: String(10000 + i), title: a.title + (i >= base.length ? " " + (i % 97) : "") }; });
const chunks = arts.flatMap((a, i) => chunks0.filter((c) => c === base[i % base.length].id).map(() => a.id));
const data = { "articles.json": arts, "chunks.json": chunks, "issues.json": J("issues.json") };
globalThis.fetch = async (u) => { const f = u.split("/index/")[1]; if (data[f]) return { json: async () => data[f] }; throw new Error("not in stress set: " + f); };
const E = await import("../src/engine.js"); const t0 = performance.now(); await E.load(); await E.search0("warm up");
const build = performance.now() - t0;
const Q = ["online learning", "teacher readiness", "chatgtp teaching", "augmentd realty nursing", "MOOC", "open educational resources cost", "assessment", "Kondo", "distance education Philippines", "learner support services gaps",
  "blended learning", "mobile learning game", "covid pandemic", "faculty", "self-regulated learning", "e-portfolio", "flipped", "library", "quality assurance", "student satisfaction", "research", "virtual reality", "AI", "plagiarism", "motivation", "rural", "nursing", "engineering", "math", "language"];
const p95 = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];
const ts = []; for (const q of Q) { const t = performance.now(); await E.search0(q); E.didYouMean(q); ts.push(performance.now() - t); }
// Advanced run() pulled out of Advanced.jsx as adv-fuzz.mjs does, on the synthetic corpus
const src = fs.readFileSync(path.join(web, "src/Advanced.jsx"), "utf8"), code = src.match(/const hit = [\s\S]*?;\n/)[0] + src.match(/function run\(areas, words, mode\) \{[\s\S]*?\n\}\n/)[0];
const issueKey = (a) => a.issue.vol + "." + a.issue.no.replace("&", "-");
const run = new Function("window", "issueKey", code + "; return run;")({ __S: { articles: arts } }, issueKey);
const tags = [...new Set(arts.flatMap((a) => a.subjects))], cats = [...new Set(arts.flatMap((a) => a.categories))];
const chip = (k, v) => ({ k, v, l: v });
const at = []; for (let i = 0; i < 30; i++) { const areas = { req: [chip("tag", tags[i % tags.length])], boost: [chip("category", cats[i % cats.length])], exp: [chip("tag", tags[(i * 7) % tags.length])], exc: [chip("tag", tags[(i * 3) % tags.length])] };
  const t = performance.now(); try { run(areas, new Map(), i % 2 ? "any" : "one"); } catch (e) { console.log("FAIL run threw", e.message); process.exit(1); } at.push(performance.now() - t); }
const rows = [["index build ms", build, 3000], ["search p95 ms", p95(ts), 200], ["Advanced run p95 ms", p95(at), 50]];
let bad = 0; for (const [n, v, max] of rows) { const o = v > max; bad += o; console.log(`${o ? "FAIL" : "PASS"} ${n} ${v.toFixed(1)} (budget ${max})`); }
console.log(`${N} chapters, ${rows.length} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
