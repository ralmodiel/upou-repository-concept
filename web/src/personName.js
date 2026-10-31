// The ONE door for how a person is shown by name in the UI. A title (Dr., Prof., Assoc. Prof., Asst. Prof.) comes from the encrypted people data (p.title) and is
// display-only: matching keys, citations, RIS/BibTeX and author fields keep the plain name.
export const titled = (p) => (p?.title ? p.title + " " : "") + p.name;
// Title for a plain name string (e.g. the adviser line of a record), once the people index is loaded; "" otherwise. The map lives on S.ppl, so Lock wipes it with the data.
export function titleOf(S, name) {
  const P = S?.ppl; if (!P) return "";
  const m = (P.titleBy ||= new Map(P.list.flatMap((p) => p.title ? [p.name, ...p.former].map((n) => [n, p.title]) : [])));
  return m.get(name) || "";
}
// "Dr. " + name when a title is known
export const withTitle = (S, name) => { const t = titleOf(S, name); return t ? t + " " + name : name; };
