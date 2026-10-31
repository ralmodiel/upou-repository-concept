import { useEffect, useState } from "react";

// Cookie / storage consent. Nothing but the choice itself is written to the device until the visitor allows it:
//   lists: the view lists only (localStorage)
//   prefs: search history and settings: advanced-search filters, saved and recent searches, citation style, text size, offline copy (localStorage)
//   (undo/redo never needs either: its history lives in memory for the visit)
//   model: download of the semantic-search model from Hugging Face (a third party sees the visitor's IP)
const K = "upou-consent", mem = new Map(), subs = new Set();
// R278: a choice older than 12 months counts as not decided, so the banner asks again; nothing stored is removed until the visitor chooses
// shortcut: a record without a readable date never expires; drop that leniency if undated records ever matter
const YEAR = 365 * 864e5, stale = (v) => Date.now() - Date.parse(v.at) > YEAR;
const read = () => { try { const v = JSON.parse(localStorage.getItem(K)); return v && typeof v === "object" && !stale(v) ? { prefs: !!v.prefs, lists: v.lists === undefined ? !!v.prefs : !!v.lists, model: !!v.model } : null; } catch { return null; } };
let c = read(); // null = not decided yet
export const allow = (k) => !!c?.[k];
const cls = (k) => (/^upou-lists?$/.test(k) ? "lists" : "prefs"); // which consent a stored key belongs to
export function setConsent(v) {
  const was = c; c = { prefs: !!v.prefs, lists: !!v.lists, model: !!v.model };
  mem.forEach((_, k) => { if (was?.[cls(k)] && !allow(cls(k))) mem.delete(k); }); // revoked class: drop its in-memory copies so a later re-grant cannot write them back
  try {
    localStorage.setItem(K, JSON.stringify({ ...c, at: new Date().toISOString() }));
    mem.forEach((val, k) => { if (allow(cls(k))) localStorage.setItem(k, val); });
    Object.keys(localStorage).filter((k) => k.startsWith("upou-") && k !== K && !allow(cls(k))).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage blocked: choices last for this visit only */ }
  if (!c.model) dropModelCache();
  subs.forEach((f) => f());
}
// Model files (Cache Storage, transformers.js) and the passage vectors (IndexedDB) are kept only under the model consent.
const dropModelCache = () => { try { ["transformers-cache", "experimental_transformers-hash-cache"].forEach((n) => caches?.delete(n)); indexedDB?.deleteDatabase("upou"); } catch { /* ignore */ } };
export const forgetConsent = () => { c = null; dropModelCache(); try { localStorage.removeItem(K); } catch { /* ignore */ } subs.forEach((f) => f()); };
export function useConsent() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return c;
}
// Preference storage: the device only when allowed, otherwise memory for this visit.
export const pref = {
  get(k) { const v = allow(cls(k)) ? (() => { try { return localStorage.getItem(k); } catch { return null; } })() : mem.get(k) ?? null; return v && v.length > 200000 ? null : v; }, // oversized: ignore
  del(k) { mem.delete(k); try { localStorage.removeItem(k); } catch { /* private mode */ } },
  set(k, v) { mem.set(k, v); if (allow(cls(k))) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } },
};
