import { useEffect, useRef, useState } from "react";
import { setConsent, useConsent } from "./consent.js";

const OPEN = "upou-open-cookies";
export const openCookieSettings = () => dispatchEvent(new Event(OPEN));
// Shared by the modal dialogs: Tab wraps inside the box; on close, focus goes back to whatever opened it (call before the effect that moves focus in)
export const trapTab = (e, box) => {
  if (e.key !== "Tab" || !box) return;
  const f = [...box.querySelectorAll("a[href],button,input,select,textarea,[tabindex='0']")].filter((x) => !x.disabled), i = f.indexOf(document.activeElement), last = f.length - 1;
  if (e.shiftKey ? i <= 0 : i < 0 || i === last) { e.preventDefault(); f[e.shiftKey ? last : 0]?.focus(); }
};
export const useRestoreFocus = () => useEffect(() => { const o = document.activeElement; return () => { if (o?.isConnected && o !== document.body) o.focus(); }; }, []);

function Switch({ id, label, hint, on, set, locked }) {
  return (
    <div className="flex items-start gap-3 border-t border-line py-3">
      <input id={id} type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={on} disabled={locked} onChange={(e) => set(e.target.checked)} />
      <label htmlFor={id} className="text-sm"><span className="font-bold text-ink">{label}{locked && <span className="ml-2 font-normal text-ink-3">always on</span>}</span><span className="mt-0.5 block text-ink-2">{hint}</span></label>
    </div>
  );
}

function Settings({ initial, onClose }) {
  const [prefs, setPrefs] = useState(!!initial?.prefs), [lists, setLists] = useState(!!initial?.lists), [model, setModel] = useState(!!initial?.model), box = useRef(null);
  useRestoreFocus();
  useEffect(() => {
    box.current?.querySelector("input:not(:disabled)")?.focus();
    const esc = (e) => { trapTab(e, box.current); if (e.key === "Escape") onClose(); };
    addEventListener("keydown", esc); return () => removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Cookie and privacy settings" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl">
        <h2 className="font-serif text-2xl text-ink">Cookie and privacy settings</h2>
        <p className="mt-1 text-sm text-ink-2">This site has no accounts, no analytics and no advertising. Choose what it may keep on your device or fetch from other services; every item below is off until you switch it on. Only your choice itself is remembered on this device, as one small record, so we do not ask again. You can change this at any time from the footer.</p>
        <div className="mt-3">
          <Switch id="c-lists" label="View lists" hint="Keeps the items you add to your view lists on this device, so they are still there next visit. Never sent anywhere." on={lists} set={setLists} />
          <Switch id="c-pref" label="Search history and settings" hint="Keeps your advanced-search filters, saved and recent searches, citation style, text size, the tour and an offline copy of the pages you open on this device. Undo and redo work without it. Never sent anywhere." on={prefs} set={setPrefs} />
          <Switch id="c-model" label="Search-by-meaning model" hint="Downloads a ~34 MB language model (Xenova/bge-small-en-v1.5, quantized q8, from Hugging Face) and its ~6 MB runtime from jsDelivr, so searches also match meaning, not only words. Both then see your IP address. The model and search vectors are kept in this browser until you withdraw. Without it, search still works on keywords." on={model} set={setModel} />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <a href="#/privacy" onClick={onClose} className="mr-auto inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline">Privacy notice</a>
          <button type="button" onClick={() => { setConsent({ prefs, lists, model }); onClose(); }} className="min-h-11 rounded-full bg-action-fill px-5 text-sm font-bold text-white hover:bg-action-2-fill">Save choices</button>
        </div>
      </div>
    </div>
  );
}

// First-visit banner (non-blocking) plus the settings dialog, reopened from the footer.
export function CookieConsent() {
  const c = useConsent(), [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setOpen(true); addEventListener(OPEN, f); return () => removeEventListener(OPEN, f); }, []);
  return (
    <>
      {!c && !open && (
        <div role="dialog" aria-label="Cookie and privacy choices" className="fixed inset-x-3 bottom-3 z-40 print:hidden mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-4 shadow-2xl sm:p-5">
          <p className="text-sm text-ink-2"><b className="text-ink">Your privacy.</b> We run no analytics or advertising of our own. With your permission we keep your view lists and filters on this device, download a search model from Hugging Face. <a href="#/privacy" className="font-medium text-link underline">Read the privacy notice</a>.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setConsent({ prefs: true, lists: true, model: true })} className="min-h-11 rounded-full bg-action-fill px-5 text-sm font-bold text-white hover:bg-action-2-fill">Accept all</button>
            <button type="button" onClick={() => setConsent({ prefs: false, lists: false, model: false })} className="min-h-11 rounded-full border-2 border-action px-5 text-sm font-bold text-action hover:bg-navy-soft">Essential only</button>
            <button type="button" onClick={() => setConsent({ prefs: false, lists: true, model: false })} className="min-h-11 rounded-full border-2 border-action px-5 text-sm font-bold text-action hover:bg-navy-soft">View lists only</button>
            <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-full border-2 border-action px-5 text-sm font-bold text-action hover:bg-navy-soft">Customize…</button>
          </div>
        </div>
      )}
      {open && <Settings initial={c} onClose={() => setOpen(false)} />}
    </>
  );
}
