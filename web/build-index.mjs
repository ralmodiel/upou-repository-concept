// Embeds data/chunks.jsonl in the browser's own model (bge-small) -> web/public/index/{chunks.json,vecs.bin}.
import { pipeline } from "@huggingface/transformers";
import fs from "node:fs";
const chunks = fs.readFileSync("../data/chunks.jsonl", "utf8").trim().split("\n").map(JSON.parse);
const embed = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8" }); // same q8 weights the browser uses
const D = 384, out = new Float32Array(chunks.length * D), B = 16;
for (let i = 0; i < chunks.length; i += B) {
  const r = await embed(chunks.slice(i, i + B).map(c => c.text), { pooling: "cls", normalize: true });
  out.set(r.data, i * D);
  if (i % 320 === 0) console.log(i, "/", chunks.length);
}
fs.mkdirSync("public/index", { recursive: true });
fs.writeFileSync("public/index/chunks.json", JSON.stringify(chunks.map((c) => c.article))); // only the owning article per vector is used
fs.writeFileSync("public/index/vecs.bin", Buffer.from(out.buffer));
console.log("done", chunks.length);
