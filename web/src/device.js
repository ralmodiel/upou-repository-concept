// Old or constrained device? Used to skip the 34 MB model and cap the 3D map. A local override: sessionStorage "upou-lite" = "0" | "1".
export function weakDevice() {
  const n = typeof navigator === "undefined" ? {} : navigator, c = n.connection || {};
  try { const o = sessionStorage.getItem("upou-lite"); if (o === "0" || o === "1") return o === "1"; } catch { /* no storage */ }
  const m = typeof performance !== "undefined" && performance.memory; // Chrome only
  return (n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || !!c.saveData || /(^|-)2g$/.test(c.effectiveType || "") || !!(m && m.usedJSHeapSize > 0.7 * m.jsHeapSizeLimit);
}
