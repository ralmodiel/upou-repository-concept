// Details/citation/map check (run in web/): node scripts/links-check.mjs
// 1) Details "Drag to a filter" chips (Fit in src/Advanced.jsx): every chip of every article hits that article in run()'s
//    hit() and its value is one the Advanced facets offer (issue/year included). 2) APA 7 citations (src/cite.js): fixed
//    name cases plus every article's author list as "Last, I. I." with suffix after initials. 3) Maps: for every article the
//    pub map seeds on it and its topic/author map links resolve to a seed option. Prints "N checks, M FAIL", exits 1 on failure.
import fs from "node:fs"; import path from "node:path";
const web = path.resolve(import.meta.dirname, ".."), rd = (f) => fs.readFileSync(path.join(web, f), "utf8");
const arts = JSON.parse(rd("public/index/articles.json")), issues = JSON.parse(rd("public/index/issues.json"));
const issueKey = (a) => a.issue.vol + "." + a.issue.no.replace("&", "-"), S = { articles: arts, issues, byId: Object.fromEntries(arts.map((a) => [a.id, a])) };
const adv = rd("src/Advanced.jsx"), maps = rd("src/Maps.jsx"), grab = (s, re) => s.match(re)?.[0] ?? (console.log("FAIL cannot find " + re), process.exit(1));
let n = 0, bad = 0; const check = (fails, msg) => { n++; if (fails.length) bad++; console.log(`${fails.length ? "FAIL" : "ok  "} ${msg}${fails.length ? ` (${fails.length}: ${fails.slice(0, 4).join(" | ")})` : ""}`); };
// 1) Fit chips
const fitAll = new Function("a", "issueKey", "return " + grab(adv, /const all = (\[[^\n]*\]);/).slice(12, -1))
const hit = new Function("issueKey", "window", grab(adv, /const hit = [\s\S]*?;\n/) + "return hit;")(issueKey, { __S: S });
const facet = { category: arts.flatMap((a) => a.categories), tag: arts.flatMap((a) => a.subjects), author: arts.flatMap((a) => a.authors), issue: arts.map(issueKey), year: arts.map((a) => String(a.year)), pub: arts.map((a) => String(a.id)) }; // pub chips (a chapter as a filter) carry the article id
const fit = arts.flatMap((a) => fitAll(a, issueKey).map((c) => [a, c]));
check(fit.filter(([a, c]) => !hit(c, a, new Map())).map(([a, c]) => `${a.id} ${c.k}=${c.v}`), `${fit.length} Fit chips match their own article`);
check(fit.filter(([, c]) => typeof c.v !== "string" || !facet[c.k]?.includes(c.v)).map(([a, c]) => `${a.id} ${c.k}=${JSON.stringify(c.v)}`), "Fit chip values are Advanced facet values (string, same form)");
check(arts.filter((a) => !["issue", "year"].every((k) => fitAll(a, issueKey).slice(0, 12).some((c) => c.k === k))).map((a) => a.id), "issue and year chips survive the 12-chip cut");
check(fit.filter(([a, c]) => c.k === "issue" && c.l !== a.issue.label).map(([a]) => a.id), "issue chips labelled with the issue label");
// 2) citations
const { citeText } = await import("../src/cite.js");
const one = (au) => citeText({ authors: au, year: "2020", title: "T", issue: { vol: 1, no: "1" }, url: "u" }).split(" (2020)")[0];
const CASES = [[["Flor, Alexander G."], "Flor, A. G."], [["Figueroa Jr., Roberto B."], "Figueroa, R. B., Jr."], [["Pugoy, Reinald Adrian DL."], "Pugoy, R. A. D. L."],
  [["Cerdeña, Ma. Gian Rose"], "Cerdeña, M. G. R."], [["ALFONSO, GRACE"], "Alfonso, G."], [["Garcia, Primo", "Alfonso, Grace"], "Garcia, P., & Alfonso, G."],
  [["A, B", "C, D", "E, F"], "A, B., C, D., & E, F."], [["Lee, Jean-Paul"], "Lee, J.-P."]];
check(CASES.filter(([au, want]) => one(au) !== want).map(([au, want]) => `${au} -> "${one(au)}" want "${want}"`), `${CASES.length} APA name cases`);
const NAME = /^[^,]+, ([A-Z]\.(-[A-Z]\.)?)( [A-Z]\.(-[A-Z]\.)?)*(, (Jr\.|Sr\.|II|III|IV))?$/;
check(arts.flatMap((a) => a.authors.filter((x) => x.includes(",")).map((x) => one([x])).filter((c) => !NAME.test(c)).map((c) => `${a.id}: ${c}`)), "every author cites as Last, initials (suffix after)");
check(arts.filter((a) => !citeText(a).includes(`(${a.year}).`) || !citeText(a).includes(`, ${a.issue.vol}(${a.issue.no}). ${a.url}`)).map((a) => a.id), "every citation has year, vol(no) and url");
// 3) maps
const build = new Function("window", "issueKey", "clip", grab(maps, /function build\(kind, id, on\) \{[\s\S]*?\n\}\n/) + "return build;")({ __S: S }, issueKey, (s) => s);
const on = { rel: true, issue: true, tag: true, category: true, author: true }, g = (k, v) => build(k, v, on);
check(arts.filter((a) => { const m = g("pub", a.id); return m.seed !== "p:" + a.id || !m.nodes.some((x) => x.id === m.seed); }).map((a) => a.id), "pub map seeds on every article");
check(arts.filter((a) => a.subjects[0] && !g("tag", decodeURIComponent(encodeURIComponent(a.subjects[0]))).nodes.length).map((a) => a.id), "topic map link resolves");
check(arts.filter((a) => !g("author", decodeURIComponent(encodeURIComponent(a.authors[0]))).nodes.some((x) => x.id === "p:" + a.id)).map((a) => a.id), "author map link includes the article");
check(arts.flatMap((a) => (a.related || []).filter((r) => !g("pub", a.id).nodes.some((x) => x.id === "p:" + r.id)).map((r) => a.id + "->" + r.id)), "related articles appear on the pub map");
console.log(`${n} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
