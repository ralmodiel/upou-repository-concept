// Candidate-topic tabs shared by /advisers and the maps. Stored with pref(): in localStorage only if the cookie choice allows
// preferences, otherwise in memory for this visit (no consent, nothing persisted).
import { pref } from "./consent.js";
export const KEY = "upou-committee", KIND = { category: "category", subtopic: "sub-topic", tag: "tag", text: "text" };
export const uid = () => Math.random().toString(36).slice(2, 8);
export const fresh = (n = 1) => ({ id: uid(), name: `Candidate topic ${n}`, topics: [], pm: null, size: 3 });
export function loadTabs() {
  try { const d = JSON.parse(pref.get(KEY) || "null"); const tabs = (d?.tabs || []).slice(0, 12).map((t) => ({ id: String(t.id).slice(0, 12), name: String(t.name).slice(0, 60), size: t.size === 4 ? 4 : 3, pm: Array.isArray(t.pm) ? t.pm.filter(Number.isInteger).slice(0, 5) : null,
    topics: (Array.isArray(t.topics) ? t.topics : []).filter((x) => Object.hasOwn(KIND, x?.k) && typeof x.v === "string") /* R258: "__proto__"/"constructor" are not kinds */.slice(0, 6).map((x) => ({ k: x.k, v: x.v.slice(0, 400) })) }));
    if (tabs.length) return { tabs, active: tabs.some((t) => t.id === d.active) ? d.active : tabs[0].id }; } catch { /* corrupt: start clean */ }
  const t = fresh(); return { tabs: [t], active: t.id };
}
export const saveTabs = (st) => pref.set(KEY, JSON.stringify(st));
export const has = (st, k, v) => (st.tabs.find((t) => t.id === st.active) || st.tabs[0]).topics.some((x) => x.k === k && x.v === v);
// target "cur" = the active tab, "new" = a new tab named after the topic. Returns the new state (already saved).
export function addTopic(k, v, target = "cur") {
  const st = loadTabs(), t = { k, v };
  if (target === "new" && st.tabs.length < 12) { const n = { ...fresh(st.tabs.length + 1), name: v.slice(0, 40), topics: [t] }; st.tabs.push(n); st.active = n.id; }
  else { const c = st.tabs.find((x) => x.id === st.active) || st.tabs[0]; if (!c.topics.some((x) => x.k === k && x.v === v) && c.topics.length < 6) { c.topics.push(t); c.pm = null; } }
  saveTabs(st); return st;
}
export function removeTopic(k, v) {
  const st = loadTabs(), c = st.tabs.find((x) => x.id === st.active) || st.tabs[0]; c.topics = c.topics.filter((x) => !(x.k === k && x.v === v)); c.pm = null; saveTabs(st); return st;
}
