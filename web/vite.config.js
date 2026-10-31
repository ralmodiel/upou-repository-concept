import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { seoPlugin } from "./scripts/seo.mjs";
import { copyFileSync, mkdirSync } from "node:fs";
// ORT_SELF=1: self-host the ONNX runtime wasm (~27 MB + Safari<26 build 14 MB) under ort/ instead of loading it from jsDelivr
const SELF = process.env.ORT_SELF === "1";
if (SELF) process.env.VITE_ORT = "ort/";
const ort = () => ({ name: "ort-self", apply: "build", writeBundle(o) {
  if (!SELF) return; mkdirSync(o.dir + "/ort", { recursive: true });
  for (const f of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"])
    copyFileSync("node_modules/onnxruntime-web/dist/" + f, o.dir + "/ort/" + f);
} });
export default defineConfig({ base: "./", worker: { format: "es" }, plugins: [react(), tailwindcss(), seoPlugin(), ort()] });
