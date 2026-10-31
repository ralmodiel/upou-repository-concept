import { useEffect, useRef, useState } from "react";
import { AiLabel } from "./App.jsx";
import { loadProfile } from "./adviserData.js";

// Round 54: AI/human writeups of a person in three lengths. Text comes from index/profiles/<slug>.json (AI, via the single adviser loader);
// a faculty file (wr) overrides a length and says whether it is AI or human and whether it was reviewed.
const LEN = [["half", "Half page"], ["one", "1 page"], ["two", "2 pages"]];
export const AI_NOTE = "AI-generated from this repository’s records, may contain errors, not an endorsement.";
export function Writeup({ slug, name, wr, collapsed = false }) {
  const [len, setLen] = useState("half"), [open, setOpen] = useState(!collapsed), [prof, setProf] = useState(undefined), [msg, setMsg] = useState(""), box = useRef(null);
  useEffect(() => { let on = true; if (open && !prof) loadProfile(slug).then((j) => on && setProf(j)).catch(() => on && setProf(null)); return () => { on = false; }; }, [open, slug]);
  const e = wr?.[len] || (prof?.[len] ? { text: prof[len], source: "ai", reviewed: false } : null);
  const label = !e ? "" : e.source === "human" ? "Edited by a person." : AI_NOTE;
  const full = e ? `${name} (${LEN.find((x) => x[0] === len)[1]})\n\n${e.text}\n\n${label}${e.reviewed ? " Reviewed." : ""}${e.note ? " " + e.note : ""}` : "";
  const copy = async () => { try { await navigator.clipboard.writeText(full); setMsg("Copied"); } catch { setMsg("Copy is blocked here: select the text"); } };
  const print = () => {
    const r = document.documentElement, b = box.current; b.setAttribute("data-print-this", ""); r.classList.add("print-wr");
    const done = () => { r.classList.remove("print-wr"); b.removeAttribute("data-print-this"); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done); setTimeout(() => window.print(), 30);
  };
  return (<section ref={box} aria-label={`Writeup of ${name}`} data-writeup-box className="mt-3 rounded-lg border border-line p-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-expanded={open} data-writeup-toggle onClick={() => setOpen(!open)} className="min-h-9 rounded-full border border-action px-3 text-sm font-medium text-action hover:bg-navy-soft">{open ? "Hide writeup" : "Show writeup"}</button>
      {open && <div role="group" aria-label="Writeup length" className="flex gap-1">{LEN.map(([k, l]) => <button key={k} type="button" data-len={k} aria-pressed={len === k} onClick={() => setLen(k)} className={`min-h-9 rounded-full border px-3 text-sm ${len === k ? "border-action bg-action-fill text-white" : "border-line"}`}>{l}</button>)}</div>}
    </div>
    {open && (prof === undefined && !wr?.[len] ? <p role="status" className="mt-2 text-sm text-ink-3">Loading…</p> : e ? <div data-writeup={len}>
      <div className="mt-2 max-w-prose space-y-3 rounded-md border border-line bg-surface px-4 py-4 text-justify text-sm leading-relaxed text-ink-2 shadow-sm hyphens-auto [text-wrap:pretty] sm:px-6" data-writeup-text>{e.text.split(/\n\s*\n|\n/).filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}</div>
      <p className="mt-2 text-xs text-ink-3" data-writeup-label>{e.source === "human" ? "Edited by a person." : <>{AI_NOTE}<AiLabel /></>}{e.reviewed ? " Reviewed." : " Not yet reviewed."} {e.note || ""}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 print:hidden"><button type="button" onClick={copy} className="min-h-9 rounded-full border border-line px-3 text-sm hover:bg-navy-soft">Copy</button><button type="button" onClick={print} className="min-h-9 rounded-full border border-line px-3 text-sm hover:bg-navy-soft">Print</button><span role="status" className="text-sm text-ink-3">{msg}</span></div>
    </div> : <p className="mt-2 text-sm text-ink-3" data-writeup-absent>Writeup not generated yet.</p>)}
  </section>);
}
