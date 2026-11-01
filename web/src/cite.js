// APA 7 reference for a repository record, as parts so the display can italicise
// the journal and volume ({i:true}) while Copy gets plain text.
const REPO = "UPOU Repository", INST = "University of the Philippines Open University";
const link = (a) => (a.doi ? "https://doi.org/" + encodeURI(a.doi) : a.url);
const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;
const yr = (a) => a.year || "n.d.";
const up = (c) => c.toUpperCase() + ".";
// "DL." / "T.K." are several initials; "Ma." / "Md." are abbreviations of one name.
const initials = (given) => given.split(/\s+/).filter(Boolean).map((w) => /^(ma|md)\.$/i.test(w) || !/^[A-Za-z]{2,3}\.$|^([A-Za-z]\.)+$/.test(w) ? w.split("-").map((p) => up(p[0])).join("-") : [...w.replace(/\./g, "")].map(up).join(" ")).join(" ");
// APA 7: initials only, and a suffix follows them ("Flor, A. B., Jr."); all-caps surnames are re-cased.
const name = (n) => {
  const [l, ...rest] = n.split(","); let sfx = "";
  const strip = (t) => t.split(/\s+/).filter((w) => SUFFIX.test(w) ? ((sfx = w.replace(/\.?$/, /^[js]r/i.test(w) ? "." : "")), false) : true).join(" ");
  const last = strip(l.trim()), g = strip(rest.join(",").trim()), fix = (t) => t === t.toUpperCase() && /[A-Z]{2}/.test(t) ? t.toLowerCase().replace(/(^|[\s-])\S/g, (m) => m.toUpperCase()) : t;
  const out = g ? `${fix(last)}, ${initials(g)}` : fix(last);
  return sfx ? `${out}, ${sfx}` : out;
};
export function citeParts(a) {
  const names = a.authors.map(name), who = names.length > 1 ? names.slice(0, -1).join(", ") + ", & " + names.at(-1) : names[0] || "";
  const t = a.title.trim(), title = /[.?!]$/.test(t) ? t : t + ".";
  const th = a.type === "Thesis";
  return th ? [{ t: `${who} (${yr(a)}). ` }, { t: t.replace(/[.?!]$/, ""), i: true }, { t: ` [Thesis, ${INST}]. ${REPO}. ${link(a)}` }] : [{ t: `${who} (${yr(a)}). ${title} ${REPO}. ${link(a)}` }];
}
export const citeText = (a) => citeParts(a).map((p) => p.t).join("");
// BibTeX and RIS for a view list's chapters (export). Braces/newlines in fields are dropped so a title cannot break the entry.
const bib = (s) => String(s ?? "").replace(/[{}\\\n\r]/g, "");
const abs = (a) => bib(String(a.abstract || "").replace(/\s+/g, " ").trim()); // no abstract in a record is no AB / abstract line
export const bibtex = (as) => as.map((a) => `@misc{upou${a.id},\n  author = {${bib(a.authors.join(" and "))}},\n  title = {${bib(a.title)}},\n  year = {${bib(a.year)}},\n  type = {${bib(a.type)}},\n  institution = {${INST}},\n  howpublished = {${REPO}},\n${a.doi ? `  doi = {${bib(a.doi)}},\n` : ""}${abs(a) ? `  abstract = {${abs(a)}},\n` : ""}  url = {${bib(a.url)}}\n}`).join("\n\n") + "\n";
const RIS_TY = { Thesis: "THES", Presentation: "SLIDE", Report: "RPRT", Article: "JOUR", Book: "BOOK" };
export const ris = (as) => as.map((a) => ["TY  - " + (RIS_TY[a.type] || "GEN"), ...a.authors.map((x) => "AU  - " + bib(x)), "TI  - " + bib(a.title), "PB  - " + INST, "PY  - " + bib(a.year), ...(a.doi ? ["DO  - " + bib(a.doi)] : []), ...(abs(a) ? ["AB  - " + abs(a)] : []), "UR  - " + bib(a.url), "ER  - "].join("\r\n")).join("\r\n") + "\r\n";
// CSV (RFC 4180, every field quoted); the stable id is the handle (20.500.13073/<n>), also in the url column. A cell starting
// with = + - @ gets a leading ' so a spreadsheet cannot run it as a formula.
const cell = (v) => `"${String(v ?? "").replace(/\s+/g, " ").trim().replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
export const handle = (a) => String(a.url || "").replace(/^.*\/handle\//, "");
export const csv = (as) => [["id", "url", "title", "authors", "year", "type", "collection", "doi", "keywords", "abstract"], ...as.map((a) => [handle(a), a.url, a.title, a.authors.join("; "), a.year, a.type, a.collection, a.doi, (a.subjects || []).join("; "), a.abstract])].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
// MLA 9 and Chicago author-date use full names as printed ("Last, Given" first, "Given Last" after); APA uses initials.
const full = (n, first) => { const [l, ...g] = n.split(","), given = g.join(",").trim(); return !given ? l.trim() : first ? `${l.trim()}, ${given}` : `${given} ${l.trim()}`; };
// the first name is inverted ("Cruz, Ana"), so even two authors take a comma before "and"
const andList = (ns) => ns.length > 1 ? ns.slice(0, -1).join(", ") + ", and " + ns.at(-1) : ns[0] || "";
const dot = (t) => (/[.?!]$/.test(t.trim()) ? t.trim() : t.trim() + ".");
export function citeStyle(a, style) {
  if (style === "mla") {
    const who = a.authors.length > 2 ? full(a.authors[0], true) + ", et al" : andList(a.authors.map((n, i) => full(n, !i)));
    return [{ t: `${dot(who)} “${dot(a.title)}” ${REPO}, ${yr(a)}, ${link(a)}.` }];
  }
  if (style === "chicago") return [{ t: `${dot(andList(a.authors.map((n, i) => full(n, !i))))} ${yr(a)}. “${dot(a.title)}” ${a.type}. ${REPO}. ${link(a)}.` }];
  return citeParts(a);
}
export const STYLES = [["apa", "APA"], ["mla", "MLA"], ["chicago", "Chicago"]];
export const styleText = (a, s) => citeStyle(a, s).map((p) => p.t).join("");
