// Shared by people-merge.mjs and faculty_check.mjs: faculty file schema validation and name matching. Pure functions, no I/O except load().
import { readFileSync, readdirSync } from "fs";
export const FAC = new URL("../public/faculty/", import.meta.url).pathname;
export const STATUS = ["active", "new", "former", "external"];
export const TITLES = ["Dr.", "Prof.", "Assoc. Prof.", "Asst. Prof.", "Engr.", "Atty.", "Mr.", "Ms.", "Mrs."]; // documented list; any other title is free text up to 30 chars
export const slugOf = (n) => n.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
export const fold = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
const PARTICLES = new Set(["de", "dela", "del", "delos", "la", "san", "van", "von"]);
// Name key = {sur, first}: first word and last word of the name, accents/case/punctuation/middle names ignored. Titles are never part of it.
// "Surname, Given" (IJODeL, author lists) and "Given Surname" both work. Particles before the surname ("Dela Peña") are dropped.
export function nameKey(name) {
  const SUF = /\b(jr|sr|ii|iii|iv)\b/g; // generational suffixes are not part of the key
  let n = String(name).trim().replace(/^((dr|prof|assoc|asst|engr|atty|mr|ms|mrs)\.?\s+)+/i, "").replace(/[.,]?\s+(jr|sr|ii|iii|iv)\.?$/i, "").replace(/,\s*(jr|sr|ii|iii|iv)\.?(?=,|$)/gi, ""), sur, giv;
  if (n.includes(",")) { const i = n.indexOf(","); sur = fold(n.slice(0, i)); giv = fold(n.slice(i + 1)).replace(SUF, " ").replace(/\s+/g, " ").trim(); }
  else { const w = fold(n).split(" "); sur = w.length > 1 ? w[w.length - 1] : ""; giv = w.slice(0, -1).join(" "); if (!sur) return null; }
  const sw = sur.split(" ").filter(Boolean), gw = giv.split(" ").filter(Boolean);
  if (!sw.length || !gw.length) return null;
  let s = sw[sw.length - 1]; if (PARTICLES.has(s) && sw.length > 1) s = sw[sw.length - 2];
  return { sur: s, first: gw[0] };
}
// exact: same surname and same first word. loose: first words equal or one is the initial of the other (used for IJODeL "Surname, J.")
export const sameKey = (a, b, loose = false) => !!a && !!b && a.sur === b.sur && (a.first === b.first || (loose && (a.first.length === 1 || b.first.length === 1) && a.first[0] === b.first[0]));
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/, PHONE = /(\+?\d[\d\s().-]{7,}\d)/, TELMAIL = /\b(mailto|tel):/i;
const walk = (v, f, path = "") => { if (typeof v === "string") f(v, path); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, f, `${path}[${i}]`)); else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, f, path + "." + k)); };
const KEYS = ["example", "slug", "canonical_slug", "name", "display_name", "title", "former_names", "aliases", "not_same_as", "corrections", "status", "since", "until", "unit", "expertise", "expertise_topics", "works", "ijodel_authors", "ijodel_exclude", "international", "not_international", "writeups", "notes"];
// Returns a list of error strings for one parsed file.
export function validate(f) {
  const e = [], str = (k, max = 200) => { if (f[k] !== undefined && (typeof f[k] !== "string" || !f[k].trim() || f[k].length > max)) e.push(`${k}: non-empty string up to ${max} chars`); };
  const list = (k, ok = (x) => typeof x === "string" && x.trim() && x.length <= 200) => { if (f[k] !== undefined && !(Array.isArray(f[k]) && f[k].every(ok))) e.push(`${k}: must be a list of valid entries`); };
  for (const k of Object.keys(f)) if (!KEYS.includes(k)) e.push(`unknown field "${k}"`);
  if (typeof f.slug !== "string" || !/^[a-z]+(-[a-z]+)*$/.test(f.slug)) e.push('slug: required, lowercase letters and hyphens only (e.g. "maria-santos-reyes")');
  if (f.canonical_slug !== undefined && !/^[a-z]+(-[a-z]+)*$/.test(f.canonical_slug)) e.push("canonical_slug: lowercase letters and hyphens only");
  if (typeof f.name !== "string" || !nameKey(f.name)) e.push('name: required, at least a first and a last name ("Given Surname")');
  str("display_name"); str("corrections", 600); str("unit"); str("notes", 1000);
  if (f.title !== undefined && (typeof f.title !== "string" || !f.title.trim() || f.title.length > 30)) e.push("title: free text up to 30 chars (documented list: " + TITLES.join(", ") + ")");
  for (const k of ["name", "display_name"]) if (typeof f[k] === "string" && /^(dr|prof|engr|atty|mr|ms|mrs|assoc|asst)\b\.?/i.test(f[k].trim())) e.push(`${k}: put the title in "title", not in the name (titles are never part of the matching key)`);
  if (f.status !== undefined && !STATUS.includes(f.status)) e.push(`status: one of ${STATUS.join(", ")} (optional: leave it out when the file only corrects names)`);
  for (const k of ["since", "until"]) if (f[k] !== undefined && !(Number.isInteger(f[k]) && f[k] >= 1950 && f[k] <= 2100)) e.push(`${k}: a year`);
  if (f.since && f.until && f.until < f.since) e.push("until is before since");
  const nm = (x) => typeof x === "string" && !!nameKey(x) && x.length <= 120;
  for (const k of ["aliases", "former_names", "not_same_as"]) list(k, nm);
  list("expertise"); list("ijodel_exclude", (x) => /^\d+$/.test(String(x))); list("international", (x) => /^(ij:)?\d+$/.test(String(x))); list("not_international", (x) => /^(ij:)?\d+$/.test(String(x)));
  list("ijodel_authors", (x) => typeof x === "string" && x.includes(",") && x.length <= 120);
  list("expertise_topics", (x) => x && ["category", "subtopic", "tag"].includes(x.k) && typeof x.v === "string");
  list("works", (x) => x && typeof x.title === "string" && x.title.length <= 300 && (x.id === undefined || /^\d+$/.test(String(x.id))));
  if (f.writeups !== undefined) { if (!f.writeups || typeof f.writeups !== "object") e.push("writeups: object with half/one/two"); else for (const [k, w] of Object.entries(f.writeups)) {
    if (!["half", "one", "two"].includes(k)) e.push(`writeups.${k}: only half, one, two`);
    else if (!w || typeof w.text !== "string" || !["ai", "human"].includes(w.source) || typeof w.reviewed !== "boolean" || (w.note !== undefined && typeof w.note !== "string")) e.push(`writeups.${k}: needs {text, source: "ai"|"human", reviewed: true|false, note?}`); } }
  walk(f, (s, p) => { if (EMAIL.test(s) || TELMAIL.test(s)) e.push(`${p}: looks like an email address or contact link (not allowed, everything here is published)`); else if (PHONE.test(s)) e.push(`${p}: looks like a phone number (not allowed)`); else if (/https?:\/\//i.test(s)) e.push(`${p}: links are not allowed in faculty files`); });
  return e;
}
// Loads every person file (README and the IJODeL snapshot excluded). Returns {files: [{file, data, errors}], examples: n}.
export function load(dir = FAC) {
  const files = []; let examples = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("ijodel-")).sort()) {
    let data; try { data = JSON.parse(readFileSync(dir + file, "utf8")); } catch (x) { files.push({ file, data: {}, errors: ["not valid JSON: " + x.message] }); continue; }
    if (data.example === true) { examples++; continue; }
    files.push({ file, data, errors: validate(data) });
  }
  return { files, examples };
}
// Cross-file errors: slugs unique, a name/alias/former name belongs to one person only.
export function crossCheck(files) {
  const e = [], slugs = new Map(), names = new Map();
  for (const { file, data: d } of files) {
    for (const s of [d.slug, d.canonical_slug].filter(Boolean)) { if (slugs.has(s) && slugs.get(s) !== file) e.push(`slug "${s}" used by ${slugs.get(s)} and ${file}`); slugs.set(s, file); }
    for (const n of [d.name, d.display_name, ...(d.aliases || []), ...(d.former_names || [])].filter(Boolean)) {
      const k = nameKey(n); if (!k) continue; const id = k.sur + "|" + k.first;
      if (names.has(id) && names.get(id) !== file) e.push(`name/alias "${n}" belongs to two people: ${names.get(id)} and ${file}`); names.set(id, file); }
  }
  return e;
}
