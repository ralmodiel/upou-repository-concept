// In-memory access state for the adviser pages. The key lives only in this module's variable: no storage, cookie or URL ever holds a credential or the key.
// Login is checked in the browser (WebCrypto PBKDF2 against public index/k.json); nothing is sent. Dev server (npm run dev) reads plaintext data and is always open.
import { useEffect, useState } from "react";
const C = () => import("./accessCrypto.js"); // R217: the PBKDF2/AES code loads on the first login, not with the entry
const BASE = import.meta.env.BASE_URL + "index/", DEV = import.meta.env.DEV;
let K = null, fails = 0, ver = 0; const subs = new Set(), wipers = new Set();
export const bump = () => { ver++; subs.forEach((f) => f()); };
export const isOpen = () => DEV || !!K;
export const onLock = (f) => wipers.add(f); // data modules register a cleaner
export function lock() { K = null; clearTimeout(idle); wipers.forEach((f) => f()); bump(); }
let idle; // auto-lock: 15 minutes without a key, click, tap or scroll (timers only; nothing stored)
const touch = () => { if (!K) return; clearTimeout(idle); idle = setTimeout(lock, 15 * 60 * 1000); };
["keydown", "pointerdown", "wheel"].forEach((t) => addEventListener(t, touch, { passive: true, capture: true }));
let pending = null; // a second submit while one check runs joins it: one attempt, one back-off step
export const login = (user, pass) => pending ||= tryLogin(user, pass).finally(() => { pending = null; });
async function tryLogin(user, pass) {
  if (user.length > 128 || pass.length > 128) { fails++; return false; } // oversized input never reaches PBKDF2
  if (fails) await new Promise((r) => setTimeout(r, Math.min(6000, 600 * 2 ** (fails - 1)))); // client-side backoff: honest, not security
  const k = await fetch(BASE + "k.json").then((r) => r.json());
  const keys = await (await C()).open(user, pass, k);
  if (!keys) { fails++; return false; }
  fails = 0; K = keys; touch(); bump(); return true;
}
// logical file name -> parsed JSON / bytes, or `d` when the file does not exist. Plaintext only in dev.
export async function adv(rel, d = null, bin = false) {
  if (!isOpen()) throw new Error("locked");
  const key = K;
  try {
    const { fileId, unseal } = DEV ? {} : await C();
    const r = await fetch(DEV ? BASE + (rel === "ijodel-articles.json" ? "../faculty/" : "") + rel : BASE + "a/" + (await fileId(key, rel)) + ".enc");
    if (!r.ok) return d;
    const b = DEV ? await r.arrayBuffer() : await unseal(key, rel, await r.arrayBuffer());
    if (!DEV && key !== K) throw new Error("locked");
    return bin ? b : JSON.parse(new TextDecoder().decode(b));
  } catch (e) { if (e.message === "locked") throw e; return d; }
}
export function useAccess() {
  const [, t] = useState(0);
  useEffect(() => { const f = () => t((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return { open: isOpen(), dev: DEV, ver };
}
