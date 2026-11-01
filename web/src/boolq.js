// Boolean search queries, as the UPOU Topic Planner sends them (Google Scholar style). Pure JS, no imports:
// the same file serves the IJODeL and UPOU Repository POCs. Check: node scripts/boolq-check.mjs
//   query := block ([AND] block)*         blocks side by side are ANDed; OR binds tighter than AND, as in Google Scholar
//   block := unit (OR unit)*
//   unit  := (NOT | -) unit | "(" query ")" | "quoted phrase" | word | word*   (a trailing * is a prefix match)
// Operators are upper case (OR, AND, NOT); matching is case- and accent-insensitive, on whole words.
// Syntax it cannot use (unbalanced brackets, an odd quote, a stray operator, field tags, inner wildcards) is dropped,
// the rest is read as plain words, and `note` says what was ignored: a bracket never makes the count zero.
const MAX = 10000;
const fold = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
const words = (s) => fold(s).match(/[\p{L}\p{N}]+/gu) || [];
// a typed word or phrase -> [{ s: token, p: prefix? }]; "e-learning" is the phrase "e learning", "learn*" a prefix
const pieces = (txt) => txt.split(/\s+/).flatMap((x) => { const w = words(x).map((s) => ({ s, p: false })); if (w.length && /\*$/.test(x)) w.at(-1).p = true; return w; });

export function parseBool(q) {
  const notes = new Set(); let plain = true;
  let s = String(q ?? "");
  if (s.length > MAX) { s = s.slice(0, MAX); notes.add(`only the first ${MAX} characters were used`); }
  s = s.replace(/[“”„″]/g, '"').replace(/\[[^\]"]*\]/g, () => (notes.add("field tags were ignored"), " "))
    .replace(/(^|[\s(])[a-z]{1,12}:(?=[^\s/])/gi, (m, b) => (notes.add("field tags were ignored"), b));
  if ((s.match(/"/g) || []).length % 2) { const i = s.lastIndexOf('"'); s = s.slice(0, i) + " " + s.slice(i + 1); notes.add("an unmatched quote was ignored"); }
  // lex: quoted phrases, brackets, and runs of anything else
  const T = [...s.matchAll(/"([^"]*)"|([()])|([^\s()"]+)/g)].map(([, ph, br, w]) => ph !== undefined ? { ph } : br ? { br } : { w });
  let d = 0, deep = 0, bad = false;
  for (const t of T) if (t.br) { d += t.br === "(" ? 1 : -1; deep = Math.max(deep, d); if (d < 0) bad = true; }
  if (bad || d || deep > 50) { notes.add(deep > 50 ? "brackets nested too deep were ignored" : "unbalanced brackets were ignored"); for (let i = T.length; i--;) if (T[i].br) T.splice(i, 1); }
  let i = 0;
  const peek = () => T[i], op = (t, o) => t?.w === o;
  const stray = (t) => { notes.add(`a stray ${t} was ignored`); return null; };
  const andQ = () => {
    const c = [];
    while (i < T.length && T[i].br !== ")") { if (op(peek(), "AND")) { plain = false; i++; if (!c.length || i >= T.length || T[i].br === ")") stray("AND"); continue; } const n = orQ(); if (n) c.push(n); }
    return c.length > 1 ? { t: "and", c: c.flatMap((x) => x.t === "and" ? x.c : [x]) } : c[0] || null;
  };
  const orQ = () => {
    const c = [], first = notQ(); if (first) c.push(first);
    while (op(peek(), "OR")) { plain = false; i++; while (op(peek(), "OR")) { i++; stray("OR"); } const n = i < T.length && T[i].br !== ")" && !op(peek(), "AND") ? notQ() : null; if (n) c.push(n); else stray("OR"); }
    return c.length > 1 ? { t: "or", c: c.flatMap((x) => x.t === "or" ? x.c : [x]) } : c[0] || null;
  };
  const notQ = () => {
    const t = peek();
    const bare = t?.w === "-" && (T[i + 1]?.br === "(" || T[i + 1]?.ph !== undefined); // -(…) and -"…"
    if (op(t, "NOT") || bare || /^-+[^-]/.test(t?.w)) {
      plain = false;
      if (t.w === "NOT" || bare) i++; else T[i] = { w: t.w.replace(/^-+/, "") }; // --x is one NOT (no recursion per dash)
      const n = i < T.length && T[i].br !== ")" && !op(peek(), "OR") && !op(peek(), "AND") ? notQ() : null;
      return n ? { t: "not", c: n } : stray("NOT");
    }
    return atom();
  };
  const atom = () => {
    const t = T[i++];
    if (t.br === "(") { plain = false; const n = andQ(); i++; return n; } // i++ skips the ")" (balanced by now)
    if (op(t, "OR") || op(t, "AND")) { plain = false; return stray(t.w); }
    const txt = t.ph ?? t.w;
    if (t.ph !== undefined || txt.includes("*")) plain = false;
    if (/\*(?=[^\s*])|[?~^]/.test(txt)) notes.add("only a trailing * is a wildcard; other wildcards were read as word breaks");
    const w = pieces(txt.replace(/\*(?=[^\s*])/g, " "));
    if (!w.length) { if (txt !== "-" && !/^[*?~^]+$/.test(txt)) notes.add(`“${txt.slice(0, 20)}” has no words and was ignored`); return null; }
    return { t: "term", v: t.ph !== undefined ? `"${t.ph.trim()}"` : txt, ph: t.ph !== undefined, w };
  };
  const ast = andQ(); // brackets are balanced by now, so this reads to the end
  return { ast, plain, note: notes.size ? `Read as plain words where needed: ${[...notes].join("; ")}.` : "" };
}

// Does the text match? ast null (empty query) matches everything.
export function matchBool(ast, text) {
  if (!ast) return true;
  const tk = words(text), at = new Map(), pre = new Map();
  tk.forEach((s, k) => (at.get(s) || at.set(s, []).get(s)).push(k));
  const starts = (w) => w.p ? (pre.get(w.s) || pre.set(w.s, [...at].filter(([s]) => s.startsWith(w.s)).flatMap(([, v]) => v)).get(w.s)) : at.get(w.s) || [];
  const same = (w, k) => k < tk.length && (w.p ? tk[k].startsWith(w.s) : tk[k] === w.s);
  const ev = (n) => n.t === "and" ? n.c.every(ev) : n.t === "or" ? n.c.some(ev) : n.t === "not" ? !ev(n.c)
    : starts(n.w[0]).some((k) => n.w.every((w, j) => !j || same(w, k + j)));
  return ev(ast);
}

// The query as text again (a chip value that parseBool reads back the same way).
const show = (n, inner) => n.t === "term" ? n.v : n.t === "not" ? "NOT " + show(n.c, true)
  : ((s) => inner ? `(${s})` : s)(n.c.map((x) => show(x, true)).join(n.t === "or" ? " OR " : " AND "));

// Advanced-search chips {k: "words", v, l}: each AND block gives a Required chip for its first term and Expand chips for
// its OR synonyms; NOT gives Exclude chips. A phrase keeps its quotes and a prefix its *, so the chip matches the same way.
export function toChips(ast) {
  const out = { req: [], exp: [], exc: [] }, seen = new Set();
  const add = (area, n) => { const v = show(n); if (seen.has(v.toLowerCase())) return; seen.add(v.toLowerCase()); out[area].push({ k: "words", v, l: v }); };
  for (const b of !ast ? [] : ast.t === "and" ? ast.c : [ast]) {
    if (b.t === "not") (b.c.t === "or" ? b.c.c : [b.c]).forEach((n) => add("exc", n));
    else (b.t === "or" ? b.c : [b]).forEach((n, k) => add(k ? "exp" : "req", n));
  }
  return out;
}
