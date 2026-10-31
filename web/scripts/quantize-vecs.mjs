// Round 43: public/index/vecs.bin float32 -> int8 (x127; the vectors are unit length), 4x smaller. Idempotent: node scripts/quantize-vecs.mjs
import fs from "fs"; const f = new URL("../public/index/vecs.bin", import.meta.url), n = JSON.parse(fs.readFileSync(new URL("../public/index/chunks.json", import.meta.url))).length * 384, b = fs.readFileSync(f);
if (b.length === n) { console.log("already int8", n); process.exit(0); }
if (b.length !== n * 4) { console.error("vecs.bin size matches neither float32 nor int8 for", n, "vectors"); process.exit(1); }
const v = new Float32Array(b.buffer, b.byteOffset, n), o = new Int8Array(n); let max = 0; for (let i = 0; i < n; i++) { max = Math.max(max, Math.abs(v[i])); o[i] = Math.round(v[i] * 127); }
if (max > 1.0001) { console.error("values above 1: not unit vectors", max); process.exit(1); }
fs.writeFileSync(f, o); console.log("int8", n, "bytes, max |x|", max.toFixed(3));
