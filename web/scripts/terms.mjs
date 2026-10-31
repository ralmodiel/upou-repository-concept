// Terminology audit: node scripts/terms.mjs. An item is an "item" or "work" of a type (Thesis, Article...), never a "publication",
// and the journal vocabulary (issue, chapter, book, volume, IJODeL) does not belong in this repository app.
// IJODeL is allowed: faculty profiles label those links "From IJODeL" (round 53); "international publications" is the scoring term. Scans string literals and JSX text in src/ (comments skipped). Prints "N files, M hits"; exits 1 on any hit.
import { readFileSync, readdirSync } from "fs";
const dir = new URL("../src/", import.meta.url), bad = [];
const files = readdirSync(dir).filter((f) => /\.jsx?$/.test(f));
const BAN = /\b((?<!international )publications?|issues?|chapters?|books?|journals?|volumes?|vol\.)\b/gi;
const JARGON = /\b(semantic|corpus|bm25|lexical)\b/gi; // plain language in screens (.jsx); engine code may use them
const TYPO = /(?<=[A-Za-z])'(?=[a-z])|\.\.\.(?![\w\[{(.])/g; // a quote between letters; "..." that is not a spread
const OK =/"Book"|\bBook:|citation_publication/; // Book is one of the item types
for (const f of files) readFileSync(new URL(f, dir), "utf8").split("\n").forEach((line, i) => {
  const code = line.replace(/\/\/.*$|\{\/\*.*?\*\/\}/g, ""); // shortcut: a "//" inside a string cuts the line; fine for this codebase
  for (const m of code.matchAll(TYPO)) bad.push(`${f}:${i + 1}: straight apostrophe or three dots: ${code.slice(Math.max(0, m.index - 25), m.index + 15).trim()}`); // R262/R263: use ’ and …
  for (const m of [...code.matchAll(BAN), ...(f.endsWith("x") ? code.matchAll(JARGON) : [])]) if (!(/^book$/i.test(m[0]) && OK.test(code))) bad.push(`${f}:${i + 1}: ${code.slice(Math.max(0, m.index - 30), m.index + 30).trim()}`);
});
bad.slice(0, 20).forEach((b) => console.log("HIT", b));
console.log(`${files.length} files, ${bad.length} hits`); process.exit(bad.length ? 1 : 0);
