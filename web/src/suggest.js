// Best suggestions for Advanced (pure, also run by scripts/suggest-eval.mjs).
// seed: chapters that seed it; glob: Map("kind\0value" -> corpus count); used/skip: "kind"+"value" keys to leave out.
// fit = n * (n / corpus count)^W: common in the seed and specific to it. w and dropAll were tuned by suggest-eval (round 69).
export const TUNE = { w: 1, dropAll: true };
export function suggest({ seed, glob, used, skip = [], nAll, hasChips, colLabel = (v) => v }, o = TUNE) {
  const cnt = new Map();
  const bump = (k, v) => { const key = k + "\u0000" + v; cnt.set(key, { k, v, l: k === "collection" ? colLabel(v) : v, n: (cnt.get(key)?.n || 0) + 1 }); };
  const colKey = (a) => (a.collection || "other").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  seed.forEach((a) => { a.subjects.forEach((s) => bump("tag", s)); a.categories.forEach((c) => bump("category", c)); (a.subtopics || []).forEach((c) => bump("subtopic", c)); if (hasChips) a.authors.forEach((x) => bump("author", x)); // no author suggestions before any filter is set
    bump("collection", colKey(a)); });
  const gone = new Set([...used, ...skip].map((x) => x.toLowerCase())); // case-folded: a chip typed in another case still counts as used
  const best = [...cnt.values()].filter((s) => !gone.has((s.k + s.v).toLowerCase()) && s.n >= Math.min(2, seed.length) && (seed.length < nAll || s.k !== "collection")
    // noise: a value every seed chapter has filters nothing; a minimum share (tried 0.15, 0.3) lowered precision
    && !(o.dropAll && seed.length > 2 && s.n === seed.length && s.k !== "author"))
    .map((s) => ({ ...s, fit: s.n * (s.n / glob.get(s.k + "\u0000" + s.v)) ** o.w })).sort((x, y) => y.fit - x.fit);
  return ["category", "subtopic", "tag", "author", "collection"].map((k) => [k, best.filter((s) => s.k === k).slice(0, k === "tag" ? 7 : 3)]).filter(([, l]) => l.length);
}
