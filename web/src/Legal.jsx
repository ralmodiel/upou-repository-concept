import { useEffect, useRef } from "react";
import { openCookieSettings, trapTab, useRestoreFocus } from "./Consent.jsx";

// Keyboard shortcut list (R216: lazy, shares this chunk with the other help pages)
const KEYS = [["/", "Jump to the search box"], ["j / k", "Next / previous item in a list of results"], ["?", "Show or hide this list"], ["Esc", "Close a dialog or the suggestions"]];
export function KeyHelp({ onClose }) {
  const ref = useRef(null);
  useRestoreFocus();
  useEffect(() => { ref.current.focus(); }, []);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { trapTab(e, ref.current); if (e.key === "Escape") onClose(); }} className="w-full max-w-sm rounded-2xl bg-surface p-5 text-ink shadow-2xl">
    <h2 className="font-serif text-xl">Keyboard shortcuts</h2>
    <dl className="mt-3 space-y-2 text-sm">{KEYS.map(([k, d]) => <div key={k} className="flex gap-3"><dt className="w-14 shrink-0 font-mono font-bold">{k}</dt><dd className="text-ink-2">{d}</dd></div>)}</dl>
    <button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-full bg-action-fill px-5 text-sm font-bold text-white hover:bg-action-2-fill">Close</button></div></div>;
}

export function Privacy() {
  const h = "mt-6 font-serif text-xl text-ink", p = "mt-2 text-ink-2";
  return (
    <article className="mx-auto max-w-3xl leading-relaxed">
      <h1 className="font-serif text-3xl text-ink">Privacy notice</h1>
      <p className="mt-2 rounded-md bg-navy-soft px-4 py-2 text-sm text-ink-2">Draft for a proof of concept. Before public launch, the University’s data protection officer should review it and fill in the operator details below.</p>
      <h2 className={h}>Who runs this site</h2>
      <p className={p}>[Operator name (personal information controller), address and contact e-mail to be completed by UP Open University.] This is a search and browsing tool over the records of the UPOU Repository (repository.upou.edu.ph): theses, student papers, scholarly articles and presentations.</p>
      <h2 className={h}>What we collect</h2>
      <p className={p}>Nothing about you reaches us. The site itself has no accounts, no analytics and no advertising, and sets no tracking cookies of its own. Everything you do here (searching, filters, view lists) happens in your browser.</p>
      <h2 className={h}>What is kept on your device</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
        <li><b>Your choice (not optional, no tracking):</b> your cookie choice (<code>upou-consent</code>), and a flag for this tab only (<code>upou-chunk-retry</code>) that lets the page reload itself once if a part failed to load, and a device-speed override for this tab only (<code>upou-lite</code>) that only you can set; the site never writes it. No consent is needed for these. Your choice is kept until you change it or clear this site’s data; after 12 months the site asks again, and what it keeps for you stays on your device, unused, until you choose.</li>
        <li><b>View lists (only if you allow “View lists”):</b> the items you add to your view lists (<code>upou-lists</code>). They stay on your device and are deleted when you withdraw consent. Without consent they last only until you close or reload the page.</li>
        <li><b>Search history and settings (only if you allow):</b> your advanced-search filters, their mode, saved and recent searches, your citation style, the reader text size, your candidate-topic tabs on the Advisers page (<code>upou-committee</code>, committee search topics) the last relationship-map seed (<code>upou-map-seed</code>, last map seed) and whether you closed the quick tour, plus an offline copy of the site and of the items you open (service worker <code>sw.js</code>, browser cache <code>upou-offline-…</code>) so they still open without a connection. They stay on your device and are deleted when you withdraw consent. Without consent they last only until you close or reload the page.</li>
        <li><b>Search model (only if you allow it):</b> the model files (browser cache <code>transformers-cache</code>) and the article search vectors (<code>upou</code> database), so the next visit does not download them again. They are deleted when you withdraw this consent.</li>
      </ul>
      <h2 className={h}>Advisers and committee search</h2>
      <p className={p} data-privacy-advisers>Your topics, thesis ideas and tabs stay in this browser. Nothing you enter on the Advisers pages or the adviser map is sent to a server. This site does not contact, notify or share anything with advisers or anyone else, and cannot reach them: it has no server, no forms and no e-mail addresses of advisers. Discuss your topic and any invitation directly with the person, not through this site. Matching runs in your browser on data files downloaded in advance; the optional search-by-meaning model is downloaded once from Hugging Face only after you opt in, and it carries none of your text. Shareable links keep topics after the # sign, which browsers never send. The Advisers pages show a live count of requests that carry your text (it should always read 0).</p>
      <p className={p}>The Advisers pages are restricted. Login is checked in your browser; nothing is sent. The password and the key made from it are kept only in memory until you press Lock, reload or close the tab: never in cookies, storage or the address.</p>
      <h2 className={h}>Other services your browser contacts</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
        <li><b>GitHub Pages</b> serves this site and, like any web host, receives your IP address and browser details in its server logs. See GitHub’s privacy statement.</li>
        <li><b>Hugging Face</b> (only if you allow the search-by-meaning model): your browser downloads a ~34 MB model (Xenova/bge-small-en-v1.5, a quantized BGE-small English embedding model, huggingface.co/Xenova/bge-small-en-v1.5), so Hugging Face receives your IP address and browser details. Without it, search uses keyword scoring only.</li>
        <li><b>jsDelivr</b> (cdn.jsdelivr.net, same consent): serves the ~6 MB ONNX runtime that runs the model, and receives your IP address and browser details.</li>
                <li><b>upou.upou.edu.ph</b>: links to the records, full texts and DOIs open the UPOU Repository (or doi.org), which have their own policies. This site never hosts or downloads the files.</li>
      </ul>
      <h2 className={h}>Your choices and rights</h2>
      <p className={p}>You can change or withdraw your choices at any time with “Cookie settings” in the footer. The site itself collects and stores no personal information about you; the services listed above process your IP address under their own policies. Under the Data Privacy Act of 2012 (Republic Act No. 10173) you have the right to be informed, to object, to access, to rectification, to erasure or blocking, to data portability, to damages, and to file a complaint with the National Privacy Commission (privacy.gov.ph). Contact the operator’s Data Protection Officer: [DPO name and e-mail to be completed by UP Open University].</p>
      <h2 className={h}>Content notices</h2>
      <p className={p}>Records, titles and abstracts come from the UPOU Repository and belong to their authors and the University; each item shows its own terms in the repository. Summaries, questions and answers, and related-reading notes are AI-generated, can contain errors, and must not be cited. Always check the original record.</p>
      <p className="mt-6"><button type="button" onClick={openCookieSettings} className="min-h-11 rounded-full bg-action-fill px-5 text-sm font-bold text-white hover:bg-action-2-fill">Open cookie settings</button></p>
    </article>
  );
}

export function About() {
  const h = "mt-6 font-serif text-xl text-ink", p = "mt-2 text-ink-2";
  return (
    <article className="mx-auto max-w-3xl leading-relaxed">
      <h1 className="font-serif text-3xl text-ink">About this site</h1>
      <p className="mt-2 rounded-md bg-navy-soft px-4 py-2 text-sm text-ink-2">Proof of concept, pending review by the UPOU library. It is not an official UPOU site.</p>
      <h2 className={h}>What it is</h2>
      <p className={p}>A search and browse layer over the UPOU Repository: shelves per collection and faculty, filters by type, year, author and topic, maps of related work, and reading lists. Everything runs in your browser; there is no server.</p>
      <h2 className={h}>Advisers: no contact, nothing sent</h2>
      <p className={p}>The Advisers pages suggest people from the records of this repository. Your topics stay in your browser, and this site does not contact, notify or share anything with advisers or anyone else, and cannot reach them. Writeups about people are AI-generated from the repository’s records unless a page says they were edited by a person; they may contain errors and are not endorsements.</p>
      <h2 className={h}>AI-generated content</h2>
      <p className={p}>Summaries, questions and answers, tags and related-reading notes are AI-generated. They can contain errors and must not be cited. Always read and cite the original record.</p>
      <h2 className={h}>Source and licence</h2>
      <p className={p}>Records were harvested from the public UPOU Repository (DSpace). Credit belongs to the authors and the University. Every item links to its official record, where the full text, when available, is held; this site does not serve any PDF. Items without a public file show “No full text available”.</p>
      <h2 className={h}>Contact</h2>
      <p className={p}>Questions about a record or its availability: contact the UPOU Repository at <a href="https://repository.upou.edu.ph" target="_blank" rel="noopener noreferrer" className="text-link underline">repository.upou.edu.ph</a>. See also the <a href="#/privacy" className="text-link underline">privacy notice</a>.</p>
    </article>
  );
}
