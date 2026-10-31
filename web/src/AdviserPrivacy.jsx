import { useEffect, useState } from "react";
import { installNetWatch, net } from "./netwatch.js";

// Round 54: persistent privacy / no-submission assurance on every adviser page, with a live check the visitor can read.
installNetWatch();
const rows = () => { const m = new Map(); try { performance.getEntriesByType("resource").forEach((e) => { let o = e.name; try { o = new URL(e.name, location.href).origin; } catch {} const k = o + " " + (e.initiatorType || "other"); m.set(k, (m.get(k) || 0) + 1); }); } catch {} return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => { const i = k.lastIndexOf(" "); return [k.slice(0, i), k.slice(i + 1), n]; }); };

function Counter() {
  const [n, setN] = useState(net.n);
  useEffect(() => { const g = () => setN(net.n); net.subs.add(g); g(); return () => net.subs.delete(g); }, []);
  return <p className="mt-1 text-ink" data-net-count role="status">Requests carrying your text: <b>{n}</b></p>;
}
function NetworkPanel() {
  const [r, setR] = useState(rows);
  useEffect(() => { const f = () => setR(rows()); let po; try { po = new PerformanceObserver(f); po.observe({ type: "resource", buffered: true }); } catch {} return () => po?.disconnect(); }, []);
  return (<div className="mt-3 text-sm" data-network>
    <h3 className="font-bold text-ink-2">Network activity since this page opened</h3>
    <p className="text-xs text-ink-3">Counted in this page: any request that is not a plain download (POST, PUT, a body, a beacon or a WebSocket message). Reading data files is a plain GET with no body. Downloads made by the background search worker are not listed here.</p>
    <table className="mt-2 w-full text-left text-xs"><caption className="sr-only">Downloads by origin and type</caption><thead><tr><th scope="col" className="py-1 pr-3">Origin</th><th scope="col" className="pr-3">Type</th><th scope="col">Downloads</th></tr></thead>
      <tbody>{r.map(([o, t, c]) => <tr key={o + t} className="border-t border-line"><td className="py-1 pr-3 break-all">{o}</td><td className="pr-3">{t}</td><td>{c}</td></tr>)}</tbody></table>
  </div>);
}

export function AdviserPrivacy() {
  return (<aside aria-label="Privacy" data-privacy-banner className="mt-4 rounded-md border border-line bg-navy-soft p-3 text-sm text-ink-2">
    <p><b>Your topics, thesis ideas and tabs stay in this browser. Nothing you enter here is sent to a server.</b></p>
    <p className="mt-1"><b>This site does not contact, notify or share anything with advisers or anyone else, and cannot reach them. Discuss your topic and any invitation directly with the person, not through this site.</b></p>
    <Counter />
    <details className="mt-2"><summary className="min-h-8 cursor-pointer font-medium text-link">How do we know?</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Matching runs in your browser, on data files that the page downloaded in advance. The site has no server that could receive anything: it is a set of static files.</li>
        <li>The optional search-by-meaning model is downloaded once from Hugging Face, and only after you opt in. The download is a plain request that carries no text of yours; the model then runs on your device.</li>
        <li>Shareable links keep topics in the part after the # sign, which browsers never send to any server.</li>
        <li>The page’s security policy only allows connections to this site and to the model download hosts, and the counter below checks this page’s own requests while you use it.</li>
      </ul>
      <NetworkPanel />
    </details>
  </aside>);
}
