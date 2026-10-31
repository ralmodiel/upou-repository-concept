// Writes the salt + salted PBKDF2 verifier for the adviser pages' login. The file is committed and shipped (the login needs the salt and hash in the browser anyway; override the path with ACCESS_FILE). Usage: node scripts/access-init.mjs <user> <password>
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const [user, pass] = process.argv.slice(2);
if (!user || !pass) { console.error("usage: node scripts/access-init.mjs <user> <password>"); process.exit(2); }
const salt = randomBytes(16), salt2 = randomBytes(16), iter = 600000; // salt2: separate public salt for the data key (src/accessCrypto.js)
const hash = pbkdf2Sync(`${user.toLowerCase()}:${pass}`, salt, iter, 32, "sha256");
const out = process.env.ACCESS_FILE || new URL("../public/index/k.json", import.meta.url).pathname;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ salt: salt.toString("hex"), salt2: salt2.toString("hex"), iter, hash: hash.toString("hex") }, null, 1) + "\n");
console.log("wrote", out);
