// View lists (R216): loaded on first visit to #/list, so the entry bundle stays smaller.
import { useMemo, useState } from "react";
import { bibtex, styleText, ris } from "./cite.js";
import { recommend } from "./recommend.js";
import { AddBtn, Card, Link, by, dec, getLists, newList, saveLists, useLists } from "./App.jsx";

// Shared/imported lists are untrusted: keep only ids of known items, at most 200, and a 40-character name without control or bidi-override characters (R259).
const cleanList = (name, ids) => ({ name: String(name || "").replace(/[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g, "").trim().slice(0, 40) || "Shared list", items: [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((i) => window.__S.byId[i]).slice(0, 200) });
const addLists = (ls) => { const l = getLists(), t = Date.now().toString(36); saveLists([...l, ...ls.map((x, i) => ({ id: "l" + t + i, ...x }))].slice(0, 50)); return "l" + t + "0"; };
const download = (name, text, type) => { const u = URL.createObjectURL(new Blob([text], { type })), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
// A shared list arrives as #/list/share/<name>/<id,id,...>; nothing is saved until the visitor asks.
export function SharedList({ name, ids }) {
  const raw = dec(ids || "").split(","), l = cleanList(dec(name || ""), raw), items = l.items.map((i) => window.__S.byId[i]), skipped = new Set(raw.filter(Boolean)).size - items.length;
  return (
    <section>
      <h1 className="font-serif text-3xl">Shared view list: {l.name}</h1>
      <p className="mt-1 text-ink-3">{items.length} item{items.length === 1 ? "" : "s"}{skipped > 0 ? `, ${skipped} skipped (unknown)` : ""}. Someone shared this list with you; save it to keep it with your own lists.</p>
      <button type="button" disabled={!items.length} onClick={() => { location.hash = "/list/" + addLists([l]); }} className="mt-4 min-h-11 rounded-full bg-action-fill px-5 text-sm font-bold text-white hover:bg-action-2-fill disabled:opacity-40">Save as my list</button>
      {items.length > 0 ? <ul className="mt-5 space-y-4">{items.map((a) => <Card key={a.id} a={a} />)}</ul> : <p className="mt-6 rounded-xl border border-dashed border-line p-8 text-center text-ink-3">This link has no items we know. <Link to="/list" className="text-link underline">Open my lists</Link></p>}
    </section>
  );
}
// Most relevant first; the list's items are the seeds, so it updates as items are added or removed.
function Recommended({ items }) {
  const recs = useMemo(() => recommend(items, window.__S.articles), [items]);
  return (
    <aside aria-labelledby="rec-h" className="lg:sticky lg:top-4 lg:self-start">
      <h2 id="rec-h" className="font-serif text-2xl">Recommended</h2>
      <p className="mt-1 text-xs text-ink-3">Papers and theses like the ones in this list, most relevant first. Worked out in your browser.</p>
      {recs.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-sm text-ink-3">Add items to this list to get recommendations.</p> :
        <ol className="mt-3 space-y-3">{recs.map(({ a, why, cov, n }) => <li key={a.id} className="rounded-xl border border-line bg-surface p-3"><Link to={"/read/" + a.id} className="font-medium text-link hover:underline">{a.title}</Link>
          <div className="mt-1 flex items-center gap-2"><div className="min-w-0 flex-1 text-xs text-ink-3">{a.type} · {a.year} · {by(a)}</div><AddBtn id={a.id} label /></div>
          {n > 0 && <p className="mt-1 text-xs text-ink-2">{n} shared topic{n === 1 ? "" : "s"} with {cov} of {items.length} listed: {why.join(", ")}</p>}</li>)}</ol>}
    </aside>
  );
}
export function MyList({ lid }) {
  const lists = useLists(), cur = lists.find((l) => l.id === lid) || lists[0], items = cur.items.map((i) => window.__S.byId[i]).filter(Boolean);
  const edit = (f) => saveLists(lists.map((l) => l.id === cur.id ? f(l) : l)), [msg, setMsg] = useState("");
  const say = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };
  const move = (id, d) => edit((l) => { const it = [...l.items], i = it.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= it.length) return l; [it[i], it[j]] = [it[j], it[i]]; return { ...l, items: it }; });
  const file = (cur.name.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "list").toLowerCase();
  const shareUrl = () => location.href.split("#")[0] + "#/list/share/" + encodeURIComponent(cur.name) + "/" + items.map((a) => a.id).join(",");
  const share = async () => { try { await navigator.clipboard.writeText(shareUrl()); say("Share link copied"); } catch { prompt("Copy this link", shareUrl()); } };
  const act = "min-h-10 text-sm text-link hover:underline";
  return (
    <section>
      <h1 className="font-serif text-3xl">My view lists</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="View lists">
        {lists.map((l) => <Link key={l.id} to={"/list/" + l.id} role="tab" aria-selected={l.id === cur.id} className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm ${l.id === cur.id ? "border-action bg-action-fill text-white" : "border-line bg-surface text-ink-2 hover:border-action-2"}`}>{l.name}<span className="opacity-70">{l.items.length}</span></Link>)}
        <button type="button" onClick={() => { const n = prompt("Name for the new view list"); if (n && n.trim()) location.hash = "/list/" + newList(n); }} className="min-h-10 rounded-full border border-dashed border-action px-4 text-sm font-medium text-action hover:bg-navy-soft">+ New list</button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><h2 className="font-serif text-2xl">{cur.name}</h2><span className="text-ink-3">{items.length} item{items.length === 1 ? "" : "s"}</span>
        <span className="ml-auto flex flex-wrap items-center gap-3">
          {items.length > 0 && <Link to={"/read/" + items[0].id} className="rounded-full bg-action-fill px-5 py-2 text-sm font-medium text-white hover:bg-action-2-fill">Start reading</Link>}
          <button type="button" onClick={() => { const n = prompt("Rename list", cur.name); if (n && n.trim()) edit((l) => ({ ...l, name: n.trim().slice(0, 40) })); }} className="min-h-10 text-sm text-link hover:underline">Rename</button>
          {lists.length > 1 && <button type="button" onClick={() => { if (confirm(`Delete “${cur.name}”?`)) { saveLists(lists.filter((l) => l.id !== cur.id)); location.hash = "/list"; } }} className="min-h-10 text-sm text-link hover:underline">Delete</button>}
          {items.length > 0 && <button type="button" onClick={() => confirm("Remove every item from this list?") && edit((l) => ({ ...l, items: [] }))} className="min-h-10 text-sm text-link hover:underline">Empty</button>}</span></div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 text-sm"><span className="text-ink-3">Export or share:</span>
        <button type="button" disabled={!items.length} className={act + " disabled:opacity-40"} onClick={share}>Copy share link</button>
        <button type="button" disabled={!items.length} className={act + " disabled:opacity-40"} onClick={() => download(file + ".json", JSON.stringify({ name: cur.name, items: cur.items }, null, 1), "application/json")}>JSON</button>
        <button type="button" disabled={!items.length} className={act + " disabled:opacity-40"} onClick={async () => { try { await navigator.clipboard.writeText(items.map((a) => styleText(a, "apa")).join("\n\n")); say(`${items.length} APA citations copied`); } catch { say("Copy failed: use BibTeX or RIS"); } }}>Copy all citations (APA)</button>
        <button type="button" disabled={!items.length} className={act + " disabled:opacity-40"} onClick={() => download(file + ".bib", bibtex(items), "application/x-bibtex")}>BibTeX</button>
        <button type="button" disabled={!items.length} className={act + " disabled:opacity-40"} onClick={() => download(file + ".ris", ris(items), "application/x-research-info-systems")}>RIS</button>
        <span role="status" className="text-xs text-ink-2">{msg}</span></div>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
      {items.length === 0 ? <p className="rounded-xl border border-dashed border-line p-8 text-center text-ink-3">This list is empty. Press <b>+</b> on any item to add it, then read them one by one.</p> :
        <ul className="space-y-4">{items.map((a, i) => <Card key={a.id} a={a} extra={<div className="mt-2 flex gap-2 text-sm"><button type="button" disabled={!i} onClick={() => move(a.id, -1)} aria-label={`Move up: ${a.title}`} className="min-h-10 rounded-full border border-line px-3 disabled:opacity-40">↑ Up</button><button type="button" disabled={i === items.length - 1} onClick={() => move(a.id, 1)} aria-label={`Move down: ${a.title}`} className="min-h-10 rounded-full border border-line px-3 disabled:opacity-40">↓ Down</button></div>} />)}</ul>}</div>
        <Recommended items={items} />
      </div>
    </section>
  );
}
