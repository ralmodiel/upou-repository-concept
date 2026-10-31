// Counts requests of this page that could carry the visitor's text: any non-GET/HEAD method or any body (fetch, XMLHttpRequest, sendBeacon, WebSocket send).
// Light and safe: each wrapper calls the original with the same arguments inside try/catch, and counts only. Page lifetime only; nothing is stored or sent.
export const net = (window.__net ||= { n: 0, subs: new Set() });
const hit = () => { net.n++; net.subs.forEach((f) => { try { f(); } catch {} }); };
const wrap = (o, k, f) => { try { const orig = o[k]; if (typeof orig === "function" && !orig.__nw) { const w = function (...a) { try { f(a); } catch {} return orig.apply(this, a); }; w.__nw = 1; o[k] = w; } } catch {} };
export function installNetWatch() {
  if (net.on) return; net.on = true;
  wrap(window, "fetch", ([i, o]) => { const m = String(o?.method || i?.method || "GET").toUpperCase(); if ((m !== "GET" && m !== "HEAD") || o?.body != null || (typeof Request !== "undefined" && i instanceof Request && i.body != null)) hit(); });
  try { const O = XMLHttpRequest.prototype.open, S = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.open = function (m, ...r) { this.__m = String(m).toUpperCase(); return O.call(this, m, ...r); };
    XMLHttpRequest.prototype.send = function (b, ...r) { try { if ((this.__m && this.__m !== "GET" && this.__m !== "HEAD") || b != null) hit(); } catch {} return S.call(this, b, ...r); }; } catch {}
  if (navigator.sendBeacon) { const sb = navigator.sendBeacon; navigator.sendBeacon = function (...a) { hit(); return sb.apply(this, a); }; }
  try { const WS = window.WebSocket; if (WS) { const S = WS.prototype.send; WS.prototype.send = function (d) { hit(); return S.call(this, d); }; } } catch {}
}
