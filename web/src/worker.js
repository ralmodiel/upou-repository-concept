// Search worker: BM25, fusion, "did you mean" and the semantic model off the main thread (see the end of engine.js).
import { load, search0, didYouMean, ready, embed } from "./engine.js";
const L = load();
const OPS = { embed, search0, didYouMean, ready: (persist) => ready(persist, (m) => postMessage({ m })) };
onmessage = async ({ data: { id, op, a } }) => {
  try { await L; postMessage({ id, r: await OPS[op](...a) }); }
  catch (e) { postMessage({ id, e: String(e?.message || e) }); }
};
