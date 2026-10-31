// Build step: web/data/people.base.json (thesis-derived, root people.py) + web/public/faculty/*.json + the IJODeL snapshot
//   -> public/index/people.json, public/index/people.bin (rows follow people.json), public/index/ijodel/<slug>.json (AI half-page summaries of matched articles).
// Run before vite build (npm run build does). Exits 1 with a clear message on any schema error. Idempotent: it never reads only web/data (base) and web/public/faculty, never its own output.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { FAC, load, crossCheck, nameKey, sameKey, slugOf, fold } from "./faculty-lib.mjs";
const W = new URL("..", import.meta.url).pathname, D = 384;

// base: [{n, s, adv, aut, v:[{n, adv, aut}]}]; files: [{file, data}]; ij: [{id, authors:["Surname, Given"], ...}]
export function mergePeople(base, files, ij = []) {
  const report = { merged: [], split: [], newPeople: [], ambiguous: [], warnings: [] };
  // groups of name variants; g.rows = base entry indexes that contribute, whole = they contribute everything they have
  let groups = base.map((p, i) => ({ vs: p.v.map((v) => ({ ...v, from: i })), slug: p.s, rows: new Set([i]), whole: true, file: null }));
  const keysOf = (d, ks) => ks.flatMap((k) => [].concat(d[k] || [])).map(nameKey).filter(Boolean);
  const hit = (v, keys) => keys.some((k) => sameKey(nameKey(v.n), k));
  for (const { file, data: d } of files) {
    const claims = keysOf(d, ["name", "display_name", "aliases", "former_names"]), nots = keysOf(d, ["not_same_as"]), slugs = [d.slug, d.canonical_slug].filter(Boolean);
    // 1 split: variants named in not_same_as leave any group that this file also claims
    for (const g of [...groups]) {
      if (!(g.vs.some((v) => hit(v, claims)) || slugs.includes(g.slug))) continue;
      const out = g.vs.filter((v) => hit(v, nots) && !hit(v, claims));
      if (out.length && out.length < g.vs.length) { g.vs = g.vs.filter((v) => !out.includes(v)); g.whole = false; report.split.push(`${file}: ${out.map((v) => v.n).join(", ")} split from ${g.vs.map((v) => v.n).join(", ")}`);
        groups.push({ vs: out, slug: slugOf(out[0].n), rows: new Set(out.map((v) => v.from)), whole: false, file: null, piece: true }); }
    }
    // 2 merge: every group holding a claimed spelling (or this slug) joins this person
    const mine = groups.filter((g) => g.vs.length && (g.vs.some((v) => hit(v, claims)) || slugs.includes(g.slug)));
    const keep = mine.filter((g) => g.vs.length);
    if (keep.length > 1) report.merged.push(`${file}: ${keep.map((g) => g.vs.map((v) => v.n).join("/")).join(" + ")}`);
    const t = keep[0] || { vs: [], slug: d.slug, rows: new Set(), whole: true, file: null };
    if (!keep.length) { groups.push(t); report.newPeople.push(d.slug); }
    for (const g of keep.slice(1)) { t.vs.push(...g.vs); g.rows.forEach((r) => t.rows.add(r)); t.whole &&= g.whole; groups = groups.filter((x) => x !== g); }
    if (t.file) report.warnings.push(`${file} and ${t.file} both match the same person`);
    t.file = file; t.d = d;
  }
  const people = [], rowSrc = [], seen = new Map();
  for (const g of groups) {
    const d = g.d, adv = [...new Set(g.vs.flatMap((v) => v.adv))], aut = [...new Set(g.vs.flatMap((v) => v.aut))];
    const bestBase = g.vs.slice().sort((a, b) => b.adv.length + b.aut.length - (a.adv.length + a.aut.length))[0];
    const n = d ? (d.display_name || d.name) : (bestBase ? base[bestBase.from].n : "");
    const s = d ? (d.canonical_slug || d.slug) : g.slug;
    const spell = [...g.vs.map((v) => v.n), ...(d ? [d.name, d.display_name, ...(d.aliases || []), ...(d.former_names || [])] : [])].filter(Boolean);
    const oldSlugs = [...new Set([...spell.map(slugOf), ...(d ? [d.slug, g.slug] : [g.slug])])].filter((x) => x && x !== s);
    const o = { n, s, adv, aut };
    if (oldSlugs.length) o.os = oldSlugs;
    if (d) {
      const man = []; const put = (k, v, label = k) => { if (v !== undefined && (!Array.isArray(v) || v.length)) { o[k] = v; man.push(label); } };
      put("st", d.status, "status"); put("ti", d.title, "title"); put("since", d.since); put("until", d.until); put("un", d.unit, "unit");
      put("ex", d.expertise, "expertise"); put("exT", d.expertise_topics, "expertise_topics"); put("own", d.works, "works");
      put("fn", d.former_names, "former_names"); put("co", d.corrections, "corrections"); put("ii", d.international, "international"); put("ni", d.not_international, "not_international");
      put("wr", d.writeups, "writeups"); put("nt", d.notes, "notes"); o.man = man; // "man": fields typed in by hand (added manually)
      if (d.display_name && d.display_name !== d.name) o.legal = d.name;
    }
    o.names = [...new Set(spell)];
    if (seen.has(s)) report.warnings.push(`slug collision ${s}`); seen.set(s, 1);
    people.push(o); rowSrc.push(g.rows.size && g.whole ? [...g.rows] : []);
  }
  // order: base order first (by first contributing row), then the rest
  const order = people.map((_, i) => i).sort((a, b) => ((rowSrc[a][0] ?? 1e9) - (rowSrc[b][0] ?? 1e9)) || a - b);
  const out = order.map((i) => people[i]), src = order.map((i) => rowSrc[i]);
  // IJODeL: surname + first name (initial allowed), ambiguous author strings are never merged; ijodel_authors forces, ijodel_exclude drops
  const byFile = new Map(); out.forEach((p, i) => { const f = files.find((x) => (x.data.canonical_slug || x.data.slug) === p.s); if (f) byFile.set(i, f.data); });
  const keys = out.map((p) => p.names.map(nameKey).filter(Boolean));
  for (const a of ij) for (const au of a.authors) {
    const k = nameKey(au); if (!k) continue;
    const forced = out.map((_, i) => i).filter((i) => (byFile.get(i)?.ijodel_authors || []).some((x) => fold(x) === fold(au)));
    let c = forced.length ? forced : out.map((_, i) => i).filter((i) => keys[i].some((pk) => sameKey(pk, k, true)));
    if (c.length > 1) { report.ambiguous.push(`${a.id} "${au}" -> ${c.map((i) => out[i].n).join(" | ")}`); continue; }
    if (!c.length) continue; const p = out[c[0]];
    if ((byFile.get(c[0])?.ijodel_exclude || []).map(String).includes(String(a.id))) continue;
    (p.ij ||= []); if (!p.ij.includes(a.id)) p.ij.push(a.id);
    if (forced.length) (p.ijf ||= []).push(a.id);
  }
  return { people: out, rowSrc: src, report };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { files, examples } = load(), errs = crossCheck(files).map((m) => "cross-file: " + m);
  for (const f of files) for (const m of f.errors) errs.push(`web/public/faculty/${f.file}: ${m}`);
  if (errs.length) { console.error(`people-merge: ${errs.length} faculty file error(s), build stopped:\n  ` + errs.join("\n  ")); process.exit(1); }
  const base = JSON.parse(readFileSync(W + "data/people.base.json", "utf8")), ij = existsSync(FAC + "ijodel-articles.json") ? JSON.parse(readFileSync(FAC + "ijodel-articles.json", "utf8")) : [];
  const half = existsSync(W + "data/ijodel-half.json") ? JSON.parse(readFileSync(W + "data/ijodel-half.json", "utf8")) : {};
  const { people, rowSrc, report } = mergePeople(base, files, ij);
  const old = readFileSync(W + "data/people.base.bin"), bin = Buffer.alloc(people.length * D);
  rowSrc.forEach((rs, r) => { if (!rs.length) return; const acc = new Float32Array(D);
    for (const i of rs) { const w = base[i].adv.length + base[i].aut.length; for (let d = 0; d < D; d++) acc[d] += new Int8Array(old.buffer, old.byteOffset + i * D, D)[d] * w; }
    const nrm = Math.hypot(...acc); if (nrm) for (let d = 0; d < D; d++) bin.writeInt8(Math.max(-127, Math.min(127, Math.round((acc[d] / nrm) * 127))), r * D + d); });
  writeFileSync(W + "public/index/people.json", JSON.stringify(people.map(({ names, ...p }) => p)));
  writeFileSync(W + "public/index/people.bin", bin);
  rmSync(W + "public/index/ijodel", { recursive: true, force: true }); mkdirSync(W + "public/index/ijodel", { recursive: true });
  let nij = 0; for (const p of people) if (p.ij?.length) { nij++; writeFileSync(`${W}public/index/ijodel/${p.s}.json`, JSON.stringify(Object.fromEntries(p.ij.filter((i) => half[i]).map((i) => [i, half[i]])))); }
  console.log(`people-merge: ${people.length} people (${base.length} base), ${files.length} faculty files (+${examples} examples skipped), ${nij} with IJODeL articles, ${report.ambiguous.length} ambiguous IJODeL author strings left unmerged, merged ${report.merged.length}, split ${report.split.length}, new ${report.newPeople.length}`);
  for (const m of [...report.merged, ...report.split, ...report.warnings]) console.log("  " + m);
}
