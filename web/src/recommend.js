// Recommends items for a view list: the listed items are the seeds. Pure overlap scoring (rarer shared tags count more),
// plus the precomputed "related" links; runs in the browser on data already loaded, nothing is sent anywhere.
const keys = (a) => [...(a.subtopics || []).map((t) => "s:" + t), ...(a.subjects || []).map((t) => "j:" + t), ...(a.autoTags || []).map((t) => "t:" + t), ...(a.categories || []).map((t) => "c:" + t)].map((k) => k.toLowerCase());
const W = { s: 3, t: 2, j: 2, c: 1 };
export function recommend(seeds, all, max = 12) {
  if (!seeds.length) return [];
  const df = new Map(); for (const a of all) for (const k of new Set(keys(a))) df.set(k, (df.get(k) || 0) + 1);
  const idf = (k) => Math.log(1 + all.length / (df.get(k) || 1));
  const have = new Set(seeds.map((s) => s.id)), sk = new Map(), au = new Set(), rel = new Map(), sks = seeds.map((s) => new Set(keys(s)));
  for (const s of seeds) {
    for (const k of new Set(keys(s))) sk.set(k, (sk.get(k) || 0) + 1);
    for (const x of s.authors || []) au.add(x);
    for (const r of s.related || []) rel.set(r.id, (rel.get(r.id) || 0) + 1);
  }
  const out = [];
  for (const a of all) {
    if (have.has(a.id)) continue;
    const shared = [...new Set(keys(a))].filter((k) => sk.has(k)), labels = new Set(shared.map((k) => k.slice(2)));
    let sc = shared.reduce((n, k) => n + (W[k[0]] || 1) * idf(k) * sk.get(k), 0); // a tag shared with more of the seeds counts for more
    sc += 4 * (rel.get(a.id) || 0) + 2 * (a.authors || []).filter((x) => au.has(x)).length;
    const cov = sks.filter((st) => shared.some((k) => st.has(k))).length; // how many of the seeds it shares something with
    sc *= 1 + cov / seeds.length;
    if (sc > 0) out.push({ a, sc, cov, n: labels.size, why: [...new Set(shared.sort((x, y) => sk.get(y) - sk.get(x) || idf(y) - idf(x)).map((k) => k.slice(2)))].slice(0, 4) });
  }
  return out.sort((x, y) => y.sc - x.sc || y.n - x.n || y.a.year - x.a.year).slice(0, max);
}
