// Query helpers shared by the Search and Advanced pages and by the planner check (scripts/planner-queries.mjs); pure JS.
// URL entry (#/search?query=… and #/advanced?query=…): query or q, years from/to, dateFromYear/dateToYear (OJS) or f.dateIssued.min/max (DSpace)
export const urlEntry = (qs) => {
  const p = new URLSearchParams(qs), y = (...k) => { for (const x of k) { const v = parseInt(p.get(x), 10); if (v > 0 && v < 10000) return v; } return null; };
  return { q: p.get("query") ?? p.get("q") ?? "", from: y("from", "dateFromYear", "f.dateIssued.min"), to: y("to", "dateToYear", "f.dateIssued.max") };
};
// The text the Boolean predicate reads for an item, per searched field (title = title + authors; the engine's fields). Advisers are never in it.
export const hayOf = (a, fields = ["title", "abstract", "half", "one", "two"]) => fields.map((f) => f === "title" ? a.title + " " + a.authors.join(" ") : a[f] || "").join("\n");
// The visible count, also for zero results: the query is echoed so a screenshot documents the search (PRISMA 2020 item 7)
export const countLine = (n, q, from, to) => `${n} result${n === 1 ? "" : "s"} for “${q}” (${from === to ? from : `${from}–${to}`})`;
