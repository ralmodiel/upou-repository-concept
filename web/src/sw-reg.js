// Offline cache (round 83): a service worker is registered only under the "prefs" consent (it stores the app on the device);
// without it any worker and its caches are removed. A waiting new version raises "upou-update" (App shows a Reload bar).
import { allow } from "./consent.js";
const sw = typeof navigator !== "undefined" && navigator.serviceWorker;
export function syncSW() {
  if (!sw || !import.meta.env.PROD) return;
  if (!allow("prefs")) { sw.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {}); caches?.keys().then((ks) => ks.filter((k) => k.startsWith("upou-offline-")).forEach((k) => caches.delete(k))).catch(() => {}); return; }
  sw.register("./sw.js", { scope: "./", updateViaCache: "none" }).then((reg) => {
    reg.active?.postMessage("on"); // re-consent: a worker kept from before the revoke re-creates its cache (R218)
    const tell = (w) => w && sw.controller && dispatchEvent(new CustomEvent("upou-update", { detail: w }));
    tell(reg.waiting);
    reg.addEventListener("updatefound", () => { const w = reg.installing; w?.addEventListener("statechange", () => w.state === "installed" && tell(w)); });
  }).catch(() => {});
}
export const applyUpdate = (w) => { sw.addEventListener("controllerchange", () => location.reload(), { once: true }); w.postMessage("skip"); };
