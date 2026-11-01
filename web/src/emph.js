// Reading aids for AI-generated text: bold = the record's key topics (first mention), italic = quoted terms and
// abbreviations in brackets, underline = the finding after "found that" / "show that" / "conclude that" etc.
// The underlined finding runs to the sentence end (a decimal point is not one); past 160 characters it ends at the last
// comma between 60 and 160 characters, or else the first comma after that, so it never stops mid-clause.
const clause = (s) => { if (s.length <= 160) return s; const c = [...s.matchAll(/,\s/g)].map((m) => m.index).filter((k) => k >= 60); const k = c.filter((x) => x <= 160).at(-1) ?? c[0]; return k ? s.slice(0, k) : s; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const emphParts = (text, terms = []) => {
  const t = [...new Set(terms.map((x) => String(x?.label ?? x?.name ?? x).trim()).filter((x) => x.length > 3))].sort((a, b) => b.length - a.length).slice(0, 40);
  const re = new RegExp([t.length && `\\b(${t.map(esc).join("|")})\\b`, `("[^"\\n]{3,80}")`, `(\\([A-Z][A-Za-z]{1,9}s?\\))`, `\\b((?:found|finds|show|shows|showed|reveal|reveals|revealed|suggest|suggests|suggested|conclude|concludes|concluded|indicate|indicates|indicated) that )((?:[^.;!?\n]|\\.(?=\\d)){8,})`].filter(Boolean).join("|"), "gi");
  const out = [], seen = new Set(); let i = 0, m;
  while ((m = re.exec(text))) {
    const g = t.length ? m.slice(1) : [undefined, ...m.slice(1)];
    if (g[0] && seen.has(g[0].toLowerCase())) continue;
    out.push(["", text.slice(i, m.index)]);
    if (g[0]) { seen.add(g[0].toLowerCase()); out.push(["b", g[0]]); }
    else if (g[1] || /^\([A-Z]{2,}/.test(g[2])) out.push(["i", g[1] || g[2]]);
    else if (g[2]) { out.push(["", g[2]]); }
    else { const u = clause(g[4]); out.push(["", g[3]], ["u", u]); re.lastIndex = m.index + m[0].length - g[4].length + u.length; } // the rest of a cut sentence is read on
    i = re.lastIndex;
  }
  out.push(["", text.slice(i)]); return out.filter(([, s]) => s);
};
