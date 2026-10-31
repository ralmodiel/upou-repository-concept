// WebCrypto only, so the browser and the build script (node) share ONE implementation. k.json = {salt, salt2, iter, hash} (all public):
//   hash = PBKDF2-SHA256(lower(user)+":"+pass, salt, iter, 32 bytes) is the login check; the data key comes from the SAME secret with the separate salt2:
//   64 bytes = AES-256-GCM key (first 32) + file-name HMAC key (last 32). A file is IV(12) || ciphertext || GCM tag, with its logical name as authenticated data.
const enc = new TextEncoder(), sub = globalThis.crypto.subtle;
export const hex = (u) => [...new Uint8Array(u)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const unhex = (s) => Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));
const bits = async (user, pass, salt, iter, n) => sub.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: iter }, await sub.importKey("raw", enc.encode(`${user.toLowerCase()}:${pass}`), "PBKDF2", false, ["deriveBits"]), n);
// null when the pair is wrong, else the two keys
const hexOf = (s, n) => typeof s === "string" && s.length === n && /^[0-9a-f]+$/.test(s);
export async function open(user, pass, k) {
  // R299 fail closed: exactly {salt, salt2, iter, hash} as access-init.mjs writes them; any other shape never reaches PBKDF2
  if (!k || typeof k !== "object" || Object.keys(k).sort().join() !== "hash,iter,salt,salt2" || !hexOf(k.salt, 32) || !hexOf(k.salt2, 32) || !hexOf(k.hash, 64)) return null;
  if (!Number.isInteger(k.iter) || k.iter < 600000 || k.iter > 5e6) return null; // no downgrade (access-init.mjs writes 600000), and no multi-minute hang from a huge count
  const [h, d] = await Promise.all([bits(user, pass, k.salt, k.iter, 256), bits(user, pass, k.salt2, k.iter, 512)]);
  let x = 0; const a = new Uint8Array(h), b = unhex(k.hash); for (let i = 0; i < 32; i++) x |= a[i] ^ (b[i] ?? 1);
  if (x) return null;
  return { aes: await sub.importKey("raw", d.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]), mac: await sub.importKey("raw", d.slice(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]) };
}
// file name in dist that reveals nothing about the person: first 16 bytes of HMAC(rel)
export const fileId = async (K, rel) => hex((await sub.sign("HMAC", K.mac, enc.encode(rel))).slice(0, 16));
export async function seal(K, rel, bytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await sub.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(rel) }, K.aes, bytes));
  const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return o;
}
export const unseal = async (K, rel, buf) => { const u = new Uint8Array(buf); return sub.decrypt({ name: "AES-GCM", iv: u.slice(0, 12), additionalData: enc.encode(rel) }, K.aes, u.slice(12)); };
