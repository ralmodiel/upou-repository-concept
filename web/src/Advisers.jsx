import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, Crumbs, Pub, slug, AiLabel, useModel } from "./App.jsx";
import { analyze, badges, buildPeople, discover, makeCtx, panel, panelText, subUniverse } from "./advisers.js";
import { allow } from "./consent.js";
import { KIND, loadTabs, saveTabs, uid, fresh } from "./committee.js";
import { embedQuery, searchArticles, startModel } from "./engine.js";
import { loadIjSummaries, loadPeople, loadSpringer, loadVecs } from "./adviserData.js";
import { AdviserPrivacy } from "./AdviserPrivacy.jsx";
import { Writeup } from "./Writeup.jsx";
import { openCookieSettings } from "./Consent.jsx";
import { SRC, SRC_LABEL } from "./scoring.js";

// people index and meaning vectors come only through adviserData.js; vectors only once the opt-in model is ready
function usePeople(needVecs) {
  const S = window.__S, [, tick] = useState(0);
  useEffect(() => {
    let on = true;
    loadPeople().then(() => on && tick((n) => n + 1)).catch((e) => { if (on) { S.pplErr = e.message; tick((n) => n + 1); } });
    if (needVecs) loadVecs().then(() => on && tick((n) => n + 1));
    return () => { on = false; };
  }, [needVecs]);
  return S.ppl;
}
const Badge = ({ p, lastYear }) => <>{badges(p, lastYear).map((b) => <span key={b} data-badge={p.st === "external" ? "external" : p.st === "former" && b.startsWith("No longer") ? "former" : p.st === "new" && p.none ? "new" : p.none ? "none" : "no-advisee"} className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950">{b}</span>)}</>;
const nm = (p) => (p.title ? p.title + " " : "") + p.name; // the title is shown, never part of a matching key
const MIXC = { adv: "bg-navy", own: "bg-action", ij: "bg-amber-600", intl: "bg-emerald-700", exp: "bg-slate-500" };
const MIXP = { adv: "none", own: "repeating-linear-gradient(45deg,rgba(255,255,255,.55) 0 2px,transparent 2px 5px)", ij: "repeating-linear-gradient(-45deg,rgba(255,255,255,.55) 0 2px,transparent 2px 5px)", intl: "radial-gradient(rgba(255,255,255,.6) 1px,transparent 1.5px) 0 0/4px 4px", exp: "repeating-linear-gradient(90deg,rgba(255,255,255,.55) 0 2px,transparent 2px 5px)" }; // pattern per source so the bar is not colour-only
function pcts(sh, ks) { const v = ks.map((k) => sh[k] * 100), f = v.map(Math.floor); let m = Math.round(v.reduce((a, x) => a + x, 0)) - f.reduce((a, x) => a + x, 0); v.map((x, i) => [x - f[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (m-- > 0) f[i]++; }); return f; } // largest remainder: the shown numbers sum to the rounded total
function Mix({ r }) { const sh = r.mixShare, ks = SRC.filter((k) => sh[k] > 0.004), pc = pcts(sh, ks), t = ks.map((k, i) => `${SRC_LABEL[k]} ${pc[i]}%`).join(", ");
  return <div className="mt-2" data-mix><div role="img" aria-label={"Evidence mix: " + t} className="flex h-2 w-full max-w-md overflow-hidden rounded bg-navy-soft">{SRC.map((k) => sh[k] > 0.004 && <span key={k} title={SRC_LABEL[k]} className={MIXC[k]} style={{ width: sh[k] * 100 + "%", backgroundImage: MIXP[k] }} />)}</div><p className="mt-1 text-xs text-ink-3">Evidence mix: {t}</p></div>; }
const chairText = (r) => { const p = r.p, n = r.per.reduce((a, x) => a + x.intl.length + x.ij.length, 0); return `${n ? `${n} international publication${n > 1 ? "s" : ""} on these topics` : "no international publication on these topics"}; advised ${p.adv.length} thesis${p.adv.length === 1 ? "" : "es"}, latest ${p.last || "none"}`; };
const span = (e) => (e.first === e.last ? `${e.first}` : `${e.first}–${e.last}`);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
function topicOptions(S) {
  if (S.advTopics) return S.advTopics;
  const c = { category: new Map(), subtopic: new Map(), tag: new Map() };
  S.articles.forEach((a) => { a.categories.forEach((x) => c.category.set(x, (c.category.get(x) || 0) + 1)); a.subtopics.forEach((x) => c.subtopic.set(x, (c.subtopic.get(x) || 0) + 1)); a.subjects.forEach((x) => c.tag.set(x, (c.tag.get(x) || 0) + 1)); });
  return (S.advTopics = Object.entries(c).flatMap(([k, m]) => [...m].map(([v, n]) => ({ k, v, n, low: v.toLowerCase() }))));
}
const kindOf = (S, v) => (topicOptions(S).find((o) => o.k === "subtopic" && o.v === v) ? "subtopic" : "tag");

function TopicInput({ topics, setTopics }) {
  const S = window.__S, [q, setQ] = useState(""), [cur, setCur] = useState(-1), id = useId(), t = q.trim().toLowerCase();
  const list = t.length < 2 ? [] : topicOptions(S).filter((o) => o.low.includes(t) && !topics.some((p) => p.k === o.k && p.v === o.v)).sort((x, y) => (x.k === "tag") - (y.k === "tag") || y.n - x.n).slice(0, 8);
  const [hint, setHint] = useState(false);
  const add = (o) => { if (o.k === "text" && !/[\p{L}\p{N}]/u.test(o.v)) return setHint(true); // R291: punctuation alone scores nothing
    if (topics.length < 6 && !topics.some((p) => p.k === o.k && p.v.toLowerCase() === o.v.toLowerCase())) setTopics([...topics, o]); setQ(""); setCur(-1); };
  const key = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCur((cur + 1) % Math.max(list.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCur((cur - 1 + list.length) % Math.max(list.length, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (cur >= 0 && list[cur]) add({ k: list[cur].k, v: list[cur].v }); else if (q.trim()) add({ k: "text", v: q.trim().slice(0, 400) }); }
    else if (e.key === "Escape") { setQ(""); setCur(-1); }
    else if (e.key === "Backspace" && !q && topics.length) setTopics(topics.slice(0, -1)); // Backspace in the empty box removes the last topic
  };
  return (<div className="relative">
    <label htmlFor={id} className="block text-sm font-bold text-ink-2">Add a topic (pick a suggestion, or type or paste a title or abstract and press Enter)</label>
    <div className="mt-1 flex gap-2"><input id={id} role="combobox" aria-expanded={list.length > 0} aria-controls={id + "l"} aria-activedescendant={cur >= 0 && list[cur] ? id + "o" + cur : undefined} aria-autocomplete="list" autoComplete="off" value={q} onChange={(e) => { setQ(e.target.value); setCur(-1); setHint(false); }} onKeyDown={key} aria-describedby={hint ? id + "h" : undefined} disabled={topics.length >= 6} placeholder="e.g. e-learning, then add a second topic" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-4 py-3 text-base text-ink" />
      <button type="button" disabled={!q.trim() || topics.length >= 6} onClick={() => add(cur >= 0 && list[cur] ? { k: list[cur].k, v: list[cur].v } : { k: "text", v: q.trim().slice(0, 400) })} className="min-h-11 rounded-md bg-action-fill px-4 font-bold text-white disabled:opacity-40">Add</button></div>
    {list.length > 0 && <ul id={id + "l"} role="listbox" aria-label="Topic suggestions" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-line bg-surface py-1 text-ink shadow-xl">
      {list.map((o, i) => <li key={o.k + o.v} id={id + "o" + i} role="option" aria-selected={i === cur} onMouseDown={(e) => e.preventDefault()} onClick={() => add({ k: o.k, v: o.v })} className={`flex cursor-pointer items-baseline gap-3 px-4 py-2 ${i === cur ? "bg-navy-soft" : ""}`}><span className="w-20 shrink-0 text-xs uppercase tracking-wide text-ink-3">{KIND[o.k]}</span><span className="line-clamp-1">{o.v}</span><span className="ml-auto text-xs text-ink-3">{o.n}</span></li>)}
    </ul>}
    {hint && <p id={id + "h"} role="status" data-topic-hint className="mt-1 text-xs text-ink-3">Type a word or a title; punctuation alone is not a topic.</p>}
    {topics.length >= 6 && <p data-max-topics className="mt-1 text-xs text-ink-3">Six topics is the most for one candidate. Remove one to add another.</p>}
    {topics.length > 0 && <ul className="mt-2 flex flex-wrap items-center gap-2 text-sm" aria-label="Topics of this candidate"><li className="text-ink-3">All of these (each one scored, then combined):</li>{topics.map((p, i) => <li key={p.k + p.v}><button type="button" onClick={() => setTopics(topics.filter((x) => x !== p))} aria-label={`Remove ${KIND[p.k]} ${p.v}`} className="min-h-9 max-w-xs truncate rounded-full bg-navy-soft px-3 text-navy hover:underline"><span className="mr-1 text-xs opacity-70">{i + 1}. {KIND[p.k]}</span>{p.v} <span aria-hidden="true">×</span></button></li>)}</ul>}
  </div>);
}

// "advised 4 theses on X; authored 2 articles on Y" with links
function Why({ r, topics }) {
  return <ul className="mt-2 space-y-1 text-sm text-ink-2">{r.per.map((x, t) => x.covered && <li key={t}>
    <b>{topics[t].v.length > 50 ? topics[t].v.slice(0, 50) + "…" : topics[t].v}</b>: {x.adv.length > 0 && <>advised {plural(x.adv.length, "thesis").replace("thesiss", "theses")}</>}{x.adv.length > 0 && x.aut.length > 0 && "; "}{x.aut.length > 0 && <>authored {plural(x.aut.length, "article")}</>}{x.ij.length > 0 && <>{(x.adv.length || x.aut.length) ? "; " : ""}{plural(x.ij.length, "IJODeL article")} (international)</>}{x.intl.length > 0 && <> ({x.intl.length} international)</>}{!x.adv.length && !x.aut.length && !x.ij.length && <>related by meaning<AiLabel /></>}
    {x.ij.slice(0, 1).map((a) => <span key={a.id}> · <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">{a.title.length > 70 ? a.title.slice(0, 70) + "…" : a.title}</a> <span className="text-ink-3">{a.year || ""} · From IJODeL</span></span>)}
    {[...x.adv, ...x.aut].slice(0, 2).map((a) => <span key={a.id}> · <Link to={"/read/" + a.id} className="text-link hover:underline">{a.title.length > 70 ? a.title.slice(0, 70) + "…" : a.title}</Link> <span className="text-ink-3">{a.year || ""}</span></span>)}
    {x.adv.length + x.aut.length > 2 && <span data-more-items> · <Link to={"/adviser/" + r.p.slug} className="text-link hover:underline">and {x.adv.length + x.aut.length - 2} more</Link></span>}</li>)}</ul>;
}
const expertise = (p) => { const m = new Map(); [...p.adv, ...p.aut].forEach((a) => a.subtopics.forEach((s) => m.set(s, (m.get(s) || 0) + 1))); return [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 4).map((z) => z[0]); };

function Discovery({ topics, onUse }) {
  const S = window.__S, ms = useModel().s, [i, setI] = useState(0), [near, setNear] = useState([]), ctx = S.ppl.ctx;
  const t = topics[Math.min(i, topics.length - 1)];
  const d = useMemo(() => discover(ctx, S.articles, t), [t, ctx]);
  useEffect(() => { let on = true; searchArticles(t.v.slice(0, 300), { k: 6 }).then((r) => on && setNear(r.filter((a) => a.type === "Thesis" || a.type === "Student paper").slice(0, 4))).catch(() => {}); return () => { on = false; }; }, [t, ms]);
  const use = (name, extra) => onUse(name, [t, ...extra.map((v) => ({ k: kindOf(S, v), v }))]);
  const Btn = ({ name, extra }) => <button type="button" onClick={() => use(name, extra)} className="ml-2 min-h-9 rounded-full border border-action px-3 text-xs font-medium text-action hover:bg-navy-soft">Use as candidate topic</button>;
  return (<section aria-labelledby="disc-h" className="mt-8 rounded-xl border border-line bg-surface p-4">
    <h3 id="disc-h" className="font-serif text-xl">Narrower thesis topics<AiLabel /></h3>
    <p className="mt-1 text-sm text-ink-2">Built in your browser from counts in this repository. Suggestions only; check the prior work before choosing.</p>
    {topics.length > 1 && <label className="mt-2 block text-sm">Start from <select value={i} onChange={(e) => setI(+e.target.value)} className="ml-1 min-h-10 rounded border border-line bg-surface px-2">{topics.map((x, k) => <option key={k} value={k}>{x.v.slice(0, 60)}</option>)}</select></label>}
    <p className="mt-2 text-sm text-ink-3">{plural(d.n, "existing item")} touch “{t.v.slice(0, 60)}”{d.n ? `, latest ${d.last}` : ""}.</p>
    {d.tags.length > 0 && <><h4 className="mt-3 text-sm font-bold text-ink-2">Frequent angles</h4><ul className="mt-1 space-y-1 text-sm">{d.tags.map(([g, n, y]) => <li key={g}><b>{g}</b> <span className="text-ink-3">· {plural(n, "existing thesis").replace("thesiss", "theses")}, latest {y}</span><Btn name={`${t.v.slice(0, 30)} + ${g}`} extra={[g]} /></li>)}</ul></>}
    {d.pairs.length > 0 && <><h4 className="mt-3 text-sm font-bold text-ink-2">Combinations already studied together</h4><ul className="mt-1 space-y-1 text-sm">{d.pairs.map(([a, b, n, y]) => <li key={a + b}><b>{a} + {b}</b> <span className="text-ink-3">· {plural(n, "item")}, latest {y}</span><Btn name={`${a} + ${b}`} extra={[a, b]} /></li>)}</ul></>}
    {d.gaps.length > 0 && <><h4 className="mt-3 text-sm font-bold text-ink-2">Possibly novel angles<AiLabel /></h4><p className="text-xs text-ink-3">Two common angles that appear together in at most one existing item here. Not a claim of novelty: other work may exist outside this repository.</p><ul className="mt-1 space-y-1 text-sm">{d.gaps.map(([a, b, na, nb, n]) => <li key={a + b}><b>{a} + {b}</b> <span className="text-ink-3">· {na} and {nb} items separately, {n} together</span><Btn name={`${a} + ${b}`} extra={[a, b]} /></li>)}</ul></>}
    {d.n === 0 && <p className="mt-2 text-sm text-ink-2">No existing items match this topic exactly, which is itself a hint of a gap. Try a broader wording.</p>}
    {near.length > 0 && <><h4 className="mt-3 text-sm font-bold text-ink-2">Closest existing theses (prior work){ms === "ready" ? <AiLabel /> : null}</h4><p className="text-xs text-ink-3">{ms === "ready" ? "Ranked by meaning and words." : "Ranked by matching words; opt in to search by meaning in the cookie settings for a meaning-based list."}</p>
      <ul className="mt-1 space-y-1 text-sm">{near.map((a) => <li key={a.id}><Link to={"/read/" + a.id} className="text-link hover:underline">{a.title}</Link> <span className="text-ink-3">· {a.year}{a.advisers.length ? ` · adviser ${a.advisers.join(", ")}` : ""}</span></li>)}</ul></>}
  </section>);
}

function TabBody({ tab, setTab, newTab, lastYear }) {
  const S = window.__S, ms = useModel().s, ppl = S.ppl, { topics } = tab;
  const [qvs, setQvs] = useState(null), [name, setName] = useState(""), [status, setStatus] = useState(""), [fm, setFm] = useState(false), [lim, setLim] = useState(30), pbox = useRef(null);
  const sem = ms === "ready" && !!S.pvecs;
  useEffect(() => { let on = true; setQvs(null); if (ms === "ready" && topics.length) Promise.all(topics.map((t) => embedQuery(t.v))).then((v) => on && v.every(Boolean) && setQvs(v)).catch(() => {}); return () => { on = false; }; }, [ms, topics]);
  const [ev, setEv] = useState(null); // meaning vectors made here (after the opt-in) for new faculty whose people.bin row is empty, from their expertise text
  useEffect(() => { let on = true; setEv(null); if (!sem) return;
    const need = ppl.list.filter((p) => p.expDoc && !S.pvecs.subarray(p.i * 384, p.i * 384 + 384).some((v) => v)), cache = (S.expVec ||= new Map());
    Promise.all(need.map(async (p) => [p.i, cache.get(p.slug) || (cache.set(p.slug, await embedQuery([...p.expertise, ...p.expT.map((x) => x.v)].join(". ").slice(0, 600))), cache.get(p.slug))])).then((l) => on && l.every((x) => x[1]) && setEv(new Map(l))).catch(() => {});
    return () => { on = false; }; }, [sem]);
  const opts = { vecs: sem ? S.pvecs : null, qvs: sem ? qvs : null, ev };
  const all = useMemo(() => analyze(ppl, ppl.ctx, topics, { ...opts, all: true }), [topics, qvs, sem, ev]);
  const rows = useMemo(() => all.filter((r) => !topics.length || r.covN > 0), [all]);
  const byI = useMemo(() => new Map(all.map((r) => [r.p.i, r])), [all]);
  const subs = useMemo(() => (topics.length ? subUniverse(ppl.ctx, S.articles, topics) : []), [topics]);
  const fixed = tab.pm ? tab.pm.map((i) => byI.get(i)).filter(Boolean) : [];
  const pn = useMemo(() => (topics.length ? panel(rows, topics, subs, { size: tab.pm ? fixed.length : tab.size, fixed, includeFormer: fm }) : null), [rows, tab.pm, tab.size, subs, fm]);
  const members = pn ? pn.members.map((m) => m.row.p.i) : [];
  const setPm = (pm) => setTab({ ...tab, pm });
  const fold = (x) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), nq = fold(name.trim()), shown = rows.filter((r) => !nq || [r.p.name, ...r.p.former].some((n) => fold(n).includes(nq)));
  const text = pn ? panelText(topics, pn, lastYear) : "";
  const copy = async () => { try { await navigator.clipboard.writeText(text); setStatus("Copied"); } catch { setStatus("Copy is blocked here: select the text below"); } };
  const nid = useId();
  return (<>
    <div className="mt-4 flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><label className="block text-sm font-bold text-ink-2" htmlFor={nid + "n"}>Name of this candidate topic</label><input id={nid + "n"} value={tab.name} onChange={(e) => setTab({ ...tab, name: e.target.value.slice(0, 60) })} className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink" /></div></div>
    <div className="mt-4"><TopicInput topics={topics} setTopics={(t) => setTab({ ...tab, topics: t, pm: null })} /></div>
    <p role="status" className="mt-3 rounded-md bg-navy-soft p-3 text-sm text-ink-2" data-mode={sem ? "meaning" : "words"}>{sem ? <>Ranking by meaning and by words<AiLabel />: topic text is embedded in your browser by the search model you opted in to.</> : <>Ranking by matching words and tags only. {allow("model") ? "The search-by-meaning model is not loaded yet; it loads when you open Search." : <>To also rank by meaning, <button type="button" onClick={openCookieSettings} className="text-link underline">turn on search by meaning</button> (opt-in download).</>}</>} Rankings are suggestions only, not endorsements.</p>
    {pn && <section ref={pbox} tabIndex={-1} aria-labelledby="panel-h" className="mt-6 rounded-xl border border-line bg-surface p-4 outline-none" data-panel>
      <h2 id="panel-h" className="font-serif text-2xl">Suggested panel<AiLabel /></h2>
      <p className="text-sm text-ink-3">A chair who has advised, then 2 or 3 more members (your choice) chosen to cover the topics you entered (greedy set cover), then complementary sub-topics. Edit freely.</p>
      {pn.members.length === 0 && <p data-no-panel className="mt-3 rounded-md border border-line p-3 text-sm text-ink-2">No panel can be suggested: nobody in this repository who has advised matches these topics. Try a broader topic, or tick “Include former faculty” below.</p>}
      <ol className="mt-3 space-y-3">{pn.members.map((m, k) => <li key={m.row.p.i} data-member={m.row.p.name} className="rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="text-xs font-bold uppercase text-ink-3">{m.role}</span><Link to={"/adviser/" + m.row.p.slug} className="font-serif text-lg text-link hover:underline">{nm(m.row.p)}</Link><Badge p={m.row.p} lastYear={lastYear} />
          <button type="button" onClick={() => { setPm(members.filter((i) => i !== m.row.p.i)); setStatus(`Removed ${m.row.p.name} from the panel`); setTimeout(() => pbox.current?.focus(), 0); }} aria-label={`Remove ${m.row.p.name} from the panel`} className="ml-auto min-h-9 rounded-full border border-line px-3 text-xs hover:bg-navy-soft">Remove</button></div>
        {m.role === "Chair" && <p className="mt-1 text-sm text-ink-2" data-chair>Chair because: {chairText(m.row)}.</p>}<Mix r={m.row} />
        <p className="mt-1 text-sm text-ink-2">{m.newTopics.length ? <>Adds: {m.newTopics.map((t) => topics[t].v.slice(0, 40)).join("; ")}</> : "Adds no new topic"}{m.newSubs.length > 0 && <> · sub-topics: {m.newSubs.join(", ")} <AiLabel /></>}</p></li>)}</ol>
      {pn.uncovered.length > 0 && <p role="alert" className="mt-3 rounded bg-amber-100 p-2 text-sm text-amber-950">Not covered by any panel member: {pn.uncovered.map((t) => topics[t].v.slice(0, 40)).join("; ")}{pn.uncovered.every((t) => !rows.some((r) => r.per[t].covered)) ? ". Nobody in this repository has items on it." : ". Try Suggest members."}</p>}
      <label className="mt-3 flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={fm} onChange={(e) => setFm(e.target.checked)} className="size-4" />Include former faculty (no longer connected to the university) and external people in suggestions</label>
      <div role="radiogroup" aria-label="Panel size" className="mt-3 flex items-center gap-2 text-sm"><span className="text-ink-3">Panel size:</span>{[3, 4].map((n) => <button key={n} type="button" role="radio" data-n={n} aria-checked={tab.size === n} tabIndex={tab.size === n ? 0 : -1} onClick={() => setTab({ ...tab, size: n, pm: null })} onKeyDown={(e) => { if (!e.key.startsWith("Arrow")) return; e.preventDefault(); const m = 7 - n; setTab({ ...tab, size: m, pm: null }); e.currentTarget.parentElement.querySelector(`[data-n="${m}"]`).focus(); }} className={`min-h-9 min-w-9 rounded-full border px-3 ${tab.size === n ? "border-action bg-action-fill text-white" : "border-line"}`}>{n}</button>)}<span className="text-xs text-ink-3">Choose 4 when topics are left uncovered.</span></div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setPm(panel(rows, topics, subs, { size: tab.size, fixed, includeFormer: fm }).members.map((m) => m.row.p.i))} className="min-h-10 rounded-full bg-action-fill px-4 text-sm font-bold text-white">Suggest members</button>
        <button type="button" onClick={copy} className="min-h-10 rounded-full border border-line px-4 text-sm font-medium hover:bg-navy-soft">Copy panel as text</button><span role="status" className="self-center text-sm text-ink-3">{status}</span></div>
      <details className="mt-2"><summary className="cursor-pointer text-sm text-ink-2">Panel as plain text</summary><textarea readOnly aria-label="Panel as plain text" value={text} rows={5} className="mt-1 w-full rounded border border-line bg-surface p-2 text-sm" /></details>
      {topics.length > 0 && <div className="mt-4 max-h-[70vh] overflow-auto" tabIndex={0} role="region" aria-label="Topic coverage table, scrolls"><table className="min-w-full text-left text-sm" data-matrix><caption className="mb-1 text-left text-sm font-bold text-ink-2">Topic coverage: panel members and the top-ranked people<span className="block text-xs font-normal text-ink-3">Yes = has items on the topic; the number is the match score from 0 to 1.</span></caption>
        <thead><tr><th scope="col" className="py-1 pr-3">Person</th>{topics.map((t, k) => <th key={k} scope="col" className="px-2 py-1">{k + 1}. {t.v.slice(0, 24)}</th>)}</tr></thead>
        <tbody>{[...new Set([...members, ...rows.slice(0, 6).map((r) => r.p.i)])].map((i) => byI.get(i)).filter(Boolean).map((r) => <tr key={r.p.i} className="border-t border-line"><th scope="row" className="sticky left-0 bg-surface py-1 pr-3 font-medium">{r.p.name}{members.includes(r.p.i) ? " (panel)" : ""}</th>{r.per.map((x, k) => <td key={k} className="px-2 py-1">{x.covered ? <span title={`score ${x.s.toFixed(2)}`}>Yes {x.s.toFixed(2)}</span> : <span aria-label="no coverage">–</span>}</td>)}</tr>)}</tbody></table></div>}
    </section>}
    <h2 className="mt-8 font-serif text-2xl">{topics.length ? "People ranked by coverage of your topics" : "People"}{topics.length > 0 && <AiLabel />}</h2>
    <div className="mt-2"><label htmlFor={nid + "s"} className="block text-sm font-bold text-ink-2">Search a name</label><input id={nid + "s"} type="search" autoComplete="off" value={name} onChange={(e) => { setName(e.target.value); setLim(30); }} placeholder="Name" className="mt-1 w-full max-w-md rounded-md border border-line bg-surface px-4 py-3 text-base text-ink" /></div>
    <p role="status" className="mt-3 text-sm text-ink-3">{plural(shown.length, "person").replace("persons", "people")}{shown.length > lim ? `, first ${lim} shown` : ""}</p>
    {topics.length === 0 && <p data-hint className="mt-2 rounded-md bg-navy-soft p-3 text-sm text-ink-2">Add a topic above to rank these people by how well they match it and to get a suggested panel.</p>}
    {shown.length === 0 && <p data-empty-people className="empty mt-2">{nq ? <>Nobody matches “{name.trim()}”{topics.length ? " among people who cover your topics" : ""}. <button type="button" onClick={() => setName("")} className="text-link underline">Clear the name</button>.</> : <>Nobody in this repository has items on these topics. Try a broader wording or fewer topics.</>}</p>}
    <ol className="mt-2 space-y-3">{shown.slice(0, lim).map((r) => { const p = r.p, ex = expertise(p); return (<li key={p.i} data-person={p.name} className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Link to={"/adviser/" + p.slug} className="font-serif text-xl text-link hover:underline">{nm(p)}</Link><Badge p={p} lastYear={lastYear} />
        {topics.length > 0 && <button type="button" disabled={members.includes(p.i) || members.length >= 5} title={members.length >= 5 && !members.includes(p.i) ? "The panel is full (5)" : undefined} onClick={() => { setPm([...members, p.i].slice(0, 5)); setStatus(`Added ${p.name} to the panel`); }} aria-label={`Add ${p.name} to the panel`} className="ml-auto min-h-9 rounded-full border border-action px-3 text-xs font-medium text-action hover:bg-navy-soft disabled:opacity-40">{members.includes(p.i) ? "In panel" : "Add to panel"}</button>}</div>
      <p className="mt-1 text-sm text-ink-2">{[p.adv.length ? `${plural(p.adv.length, "advisee")}${p.first ? ` · active ${span(p)}` : ""}` : "", p.aut.length ? `author of ${plural(p.aut.length, "article")}` : ""].filter(Boolean).join(" · ")}{topics.length > 1 && ` · covers ${r.covN} of ${topics.length} topics`}</p>
      {ex.length > 0 && <p className="mt-1 text-xs text-ink-3">Expertise<AiLabel />: {ex.join(", ")}</p>}
      {topics.length > 0 && <><p data-match className="mt-1 text-sm text-ink-2">Match: {rows[0]?.total > 0 ? Math.round((100 * r.total) / rows[0].total) : 0}% of the best match in this list</p><Mix r={r} /></>}
      <p className="mt-1 text-sm"><Link to={"/maps/adviser/" + p.slug} className="text-link hover:underline">View relationship map</Link></p>
      <Writeup slug={p.slug} name={p.name} wr={p.wr} collapsed />
      {topics.length > 0 ? <Why r={r} topics={topics} /> : <ul className="mt-2 space-y-1 text-sm">{[...p.adv, ...p.aut].slice(0, 3).map((a) => <li key={a.id}><Link to={"/read/" + a.id} className="text-link hover:underline">{a.title}</Link> <span className="text-ink-3">{a.year || ""}</span></li>)}</ul>}
    </li>); })}</ol>
    {shown.length > lim && <button type="button" data-more onClick={() => setLim(lim + 30)} className="mt-3 rounded-md bg-action-fill px-6 py-2.5 font-bold text-white hover:bg-action-2-fill">Show 30 more ({shown.length - lim} left)</button>}
    {topics.length > 0 && <Discovery key={tab.id} topics={topics} onUse={newTab} />}
  </>);
}

function SpringerList({ slug }) {
  const [w, setW] = useState(null);
  useEffect(() => { let on = true; loadSpringer().then((m) => on && setW(m[slug] || [])).catch(() => {}); return () => { on = false; }; }, [slug]);
  if (!w?.length) return null;
  return <section aria-label="Springer papers" data-springer className="mt-4 text-sm"><h2 className="text-xs font-bold uppercase tracking-wide text-ink-3">Springer papers (matched through Crossref)</h2>
    <ul className="mt-1 list-disc pl-5 text-ink-2">{w.map((r) => <li key={r.doi}><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-link underline">{r.title}</a>{r.container && <>, {r.container}</>}{r.year && <> ({r.year})</>}</li>)}</ul>
    <p className="mt-1 text-xs text-ink-3">Links open the publisher’s page; this site does not copy the works. Matches are automatic and may miss or mistake a person.</p></section>;
}
export function Advisers() {
  const S = window.__S, ms = useModel().s, ppl = usePeople(ms === "ready"), init = useRef(null), [st, setSt] = useState(() => (init.current = loadTabs())), { tabs, active } = st;
  useEffect(() => { if (allow("model")) startModel(true); }, []);
  useEffect(() => { saveTabs(st); }, [st]);
  if (!ppl) return <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><h1 className="font-serif text-3xl">Advisory committee search</h1>{S.pplErr ? <p role="alert" className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">The adviser data could not be loaded ({S.pplErr}). Reload the page; if it keeps happening, sign out and in again.</p> : <div className="skeleton mt-4 h-[50vh]" role="status" aria-label="Loading" />}</section>;
  const cur = tabs.find((t) => t.id === active) || tabs[0], lastYear = ppl.lastYear, ix = tabs.indexOf(cur);
  const setTab = (t) => setSt({ ...st, tabs: tabs.map((x) => (x.id === t.id ? t : x)) });
  const addTab = (name, topics, at = tabs.length) => { if (tabs.length >= 12) return; const t = { ...fresh(), name: name.slice(0, 60), topics: topics.slice(0, 6) }; const l = [...tabs]; l.splice(at, 0, t); setSt({ tabs: l, active: t.id }); };
  const del = () => { if (tabs.length < 2 || !confirm(`Delete “${cur.name}”?`)) return; const l = tabs.filter((t) => t !== cur); setSt({ tabs: l, active: l[Math.min(ix, l.length - 1)].id }); };
  const move = (d) => { const j = ix + d; if (j < 0 || j >= tabs.length) return; const l = [...tabs]; [l[ix], l[j]] = [l[j], l[ix]]; setSt({ ...st, tabs: l }); };
  const onKey = (e) => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; let j = k !== undefined ? (ix + k + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1; if (j < 0) return; e.preventDefault(); setSt({ ...st, active: tabs[j].id }); setTimeout(() => document.getElementById("tab-" + tabs[j].id)?.focus(), 0); };
  const sumText = tabs.map((t) => `${t.name}: ${t.topics.map((x) => x.v).join("; ") || "(no topics yet)"}`).join("\n");
  const known = S.articles.filter((a) => a.advisers.length).length, theses = S.articles.filter((a) => a.type === "Thesis" || a.type === "Student paper").length;
  return (
    <section className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 py-8 sm:px-8">
      <h1 className="font-serif text-3xl">Advisory committee search</h1>
      <p className="mt-1 text-sm text-ink-2">Enter one or several topics for a thesis idea and get people whose theses advised or articles written match them, and a suggested panel that together covers the topics. Names come from each thesis approval sheet and from item author lists; no profile or contact details are shown.</p>
      <AdviserPrivacy />
      <p className="mt-2 rounded-md bg-navy-soft p-3 text-sm text-ink-2"><b>“No advisee in {lastYear}”</b> means the adviser’s latest thesis in this repository is older than {lastYear}, the latest year with any item here. It is based only on theses in this repository and says nothing about whether the person is available. “Has not advised in this repository” marks authors with no advisee here. Advisers are read for {known} of {theses} theses and student papers so far.</p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Candidate thesis topics" onKeyDown={onKey} className="flex min-w-0 flex-wrap gap-1">{tabs.map((t) => <button key={t.id} id={"tab-" + t.id} role="tab" type="button" aria-selected={t.id === cur.id} aria-controls={"tp-" + t.id} tabIndex={t.id === cur.id ? 0 : -1} title={t.name} onClick={() => setSt({ ...st, active: t.id })} className={`min-h-11 max-w-[12rem] truncate rounded-full border px-4 text-sm font-medium ${t.id === cur.id ? "border-action bg-action-fill text-white" : "border-line bg-surface text-ink-2 hover:bg-navy-soft"}`}>{t.name || "Untitled"}</button>)}</div>
        <button type="button" disabled={tabs.length >= 12} onClick={() => addTab(`Candidate topic ${tabs.length + 1}`, [])} className="min-h-11 rounded-full border border-dashed border-action px-4 text-sm font-medium text-action hover:bg-navy-soft disabled:opacity-40">+ New topic</button>
        <button type="button" disabled={tabs.length >= 12} onClick={() => addTab(cur.name + " (copy)", cur.topics, ix + 1)} className="min-h-11 rounded-full border border-line px-4 text-sm hover:bg-navy-soft disabled:opacity-40">Duplicate</button>
        <button type="button" disabled={ix === 0} onClick={() => move(-1)} aria-label="Move this tab left" className="min-h-11 rounded-full border border-line px-3 text-sm hover:bg-navy-soft disabled:opacity-40">←</button>
        <button type="button" disabled={ix === tabs.length - 1} onClick={() => move(1)} aria-label="Move this tab right" className="min-h-11 rounded-full border border-line px-3 text-sm hover:bg-navy-soft disabled:opacity-40">→</button>
        <button type="button" disabled={tabs.length < 2} onClick={del} className="min-h-11 rounded-full border border-line px-4 text-sm text-link hover:bg-navy-soft disabled:opacity-40">Delete</button></div>
      <div role="tabpanel" tabIndex={-1} className="outline-none" id={"tp-" + cur.id} aria-labelledby={"tab-" + cur.id}><TabBody key={cur.id} tab={cur} setTab={setTab} newTab={(n, t) => { addTab(n, t); setTimeout(() => document.querySelector("[role=tabpanel]")?.focus(), 50); }} lastYear={lastYear} /></div>
      {tabs.length > 1 && <CompareAll tabs={tabs} ppl={ppl} />}
      <details className="mt-8"><summary className="cursor-pointer text-sm text-ink-2">All candidate topics as plain text</summary><textarea readOnly aria-label="All candidate topics as plain text" value={sumText} rows={Math.min(8, tabs.length + 1)} className="mt-1 w-full rounded border border-line bg-surface p-2 text-sm" /></details>
      <p className="mt-2 text-xs text-ink-3">Tabs are kept only in this browser, and only if you allowed saving preferences in the cookie settings.</p>
    </section>
  );
}

// advisers recurring across tabs: ranked by words/tags only (cheap, no model)
function CompareAll({ tabs, ppl }) {
  const rec = useMemo(() => { const m = new Map(); tabs.filter((t) => t.topics.length).forEach((t) => analyze(ppl, ppl.ctx, t.topics).slice(0, 5).forEach((r) => { const e = m.get(r.p.i) || { p: r.p, tabs: [] }; e.tabs.push(t.name); m.set(r.p.i, e); }));
    return [...m.values()].filter((e) => e.tabs.length > 1); }, [tabs, ppl]);
  return rec.length ? <section className="mt-8" aria-labelledby="cmp-h"><h2 id="cmp-h" className="font-serif text-2xl">People who recur across your topics</h2><ul className="mt-2 space-y-1 text-sm">{rec.map((e) => <li key={e.p.i}><Link to={"/adviser/" + e.p.slug} className="text-link hover:underline">{e.p.name}</Link> <span className="text-ink-3">· top 5 for {e.tabs.join(", ")}</span></li>)}</ul></section> : null;
}

function IjList({ e }) {
  const [half, setHalf] = useState({});
  useEffect(() => { let on = true; if (e.ij.length) loadIjSummaries(e.slug).then((h) => on && setHalf(h)); return () => { on = false; }; }, [e.slug]);
  if (!e.ij.length) return null;
  return <section className="mt-8" aria-labelledby="ij-h" data-ijodel><h2 id="ij-h" className="font-serif text-2xl">Articles from IJODeL</h2>
    <p className="text-sm text-ink-3">Matched by name ({e.ij.some((a) => e.ijForced.includes(a.id)) ? "some added by a faculty file" : "surname and first name"}); a name that fits more than one person is not matched. Summaries are AI-written<AiLabel /> and link to the IJODeL page.</p>
    <ul className="mt-3 space-y-3">{e.ij.map((a) => <li key={a.id} className="rounded-lg border border-line p-3"><a href={a.url} target="_blank" rel="noopener noreferrer" className="font-serif text-lg text-link hover:underline">{a.title}</a>
      <p className="text-xs text-ink-3">From IJODeL · {a.year || ""} · {e.ijForced.includes(a.id) ? "set in the faculty file" : "matched by name"}</p>{half[a.id] && <p className="mt-1 text-sm text-ink-2">{half[a.id]} <AiLabel /></p>}</li>)}</ul></section>;
}
export function AdviserPage({ id }) {
  const ppl = usePeople(false), e = ppl?.bySlug.get(id);
  useEffect(() => { if (!e) return; const was = document.title; document.title = nm(e) + " · Advisers"; return () => { document.title = was; }; }, [e]);
  useEffect(() => { if (e && id !== e.slug) location.replace("#/adviser/" + e.slug); }, [e, id]); // an old name or spelling lands on the merged person
  if (!ppl) return window.__S.pplErr ? <p role="alert" data-load-error className="mx-auto mt-8 max-w-6xl px-4 text-sm text-ink-2">The adviser data could not be loaded ({window.__S.pplErr}). Reload the page; if it keeps happening, sign out and in again.</p> : <div className="skeleton mt-4 h-[40vh]" role="status" aria-label="Loading" />;
  const items = e ? [...new Map([...e.adv, ...e.aut].map((a) => [a.id, a])).values()].sort((x, y) => y.year - x.year) : [], man = (f) => e.man.includes(f) ? " (added manually)" : "";
  return (
    <section className="mx-auto max-w-6xl min-[1536px]:max-w-[88rem] px-4 py-8 sm:px-8">
      <Crumbs trail={[["/", "Home"], ["/advisers", "Advisers"], [null, e ? e.name : "Not found"]]} />
      {!e ? <p className="mt-4 text-ink-2">We could not find that person. <Link to="/advisers" className="text-link underline">Search advisers by topic</Link>.</p> : <>
        <h1 className="mt-2 font-serif text-3xl font-light">{nm(e)}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-3 text-ink-3"><span>{[e.adv.length ? `Adviser of ${plural(e.adv.length, "thesis").replace("thesiss", "theses")}${e.first ? ` · ${span(e)}` : ""}` : "", e.aut.length ? `Author of ${plural(e.aut.length, "article")}` : "", e.ij.length ? `${plural(e.ij.length, "IJODeL article")}` : ""].filter(Boolean).join(" · ")}</span><Badge p={e} lastYear={ppl.lastYear} /></p>
        {(e.inactive || e.none) && <p className="mt-2 text-sm text-ink-2">Based only on items in this repository{e.inactive ? `: the latest advisee is from ${e.last}, earlier than ${ppl.lastYear}` : ""}. It does not say whether the person is available.</p>}
        {(e.former.length > 0 || e.corrections) && <p className="mt-2 text-sm text-ink-2" data-name-history><b>Name history{man("former_names")}:</b> {e.former.length > 0 && <>also written as {e.former.join("; ")}. </>}{e.corrections}</p>}
        {(e.unit || e.expertise.length > 0) && <p className="mt-2 text-sm text-ink-2">{e.unit && <>Unit: {e.unit}{man("unit")}. </>}{e.expertise.length > 0 && <>Expertise{man("expertise")}: {e.expertise.join(", ")}.</>}</p>}
        <AdviserPrivacy />
        <p className="mt-3"><Link to={"/maps/adviser/" + e.slug} className="inline-flex min-h-10 items-center rounded-full border border-action px-4 text-sm font-medium text-action hover:bg-navy-soft">View relationship map</Link></p>
        <Writeup slug={e.slug} name={nm(e)} wr={e.wr} />
        <SpringerList slug={e.slug} />
        <ul className="grid-pubs mt-6">{items.map((a) => <Pub key={a.id} a={a} />)}</ul><IjList e={e} /></>}
    </section>
  );
}
