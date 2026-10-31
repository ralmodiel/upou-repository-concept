// Shared by the browser gates: sign in to the restricted adviser pages with ADV_USER / ADV_PASS from the environment (never from a file), read plaintext SOURCE data
// (public/, not shipped in dist), and serve modified encrypted data to a page for fixtures.
import { readFileSync } from "node:fs";
import { open, seal, fileId } from "../src/accessCrypto.js";
const W = new URL("..", import.meta.url).pathname;
export const creds = () => { const u = process.env.ADV_USER, p = process.env.ADV_PASS; if (!u || !p) { console.error("This gate needs ADV_USER and ADV_PASS in the environment (inline, never in a file)."); process.exit(2); } return { u, p }; };
export const src = (f) => JSON.parse(readFileSync(W + "public/" + f, "utf8"));
export const ADV_ROUTE = /^\/(advisers?|maps\/(adviser|author))(\/|$)/;
// base = "http://host:port". Leaves the page unlocked on #/advisers.
export async function signIn(page, base) {
  const { u, p } = creds();
  if (await page.locator("[data-lock]").count()) return;
  await page.goto(base + "/#/advisers");
  await page.waitForSelector("[data-login], [data-lock]");
  if (await page.locator("[data-lock]").count()) return;
  await page.getByLabel("Username").fill(u); await page.getByLabel("Password").fill(p);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForSelector("[data-lock]", { timeout: 20000 });
}
// serve `fn(json)` (or a fixed object) as the encrypted content of logical file `rel` to this page/context
export async function routeAdv(target, rel, fn) {
  const { u, p } = creds(), K = await open(u, p, src("index/k.json")), id = await fileId(K, rel);
  const base = rel === "people.json" ? src("index/people.json") : null;
  await target.route("**/index/a/" + id + ".enc", async (r) => r.fulfill({ contentType: "application/octet-stream", body: Buffer.from(await seal(K, rel, Buffer.from(JSON.stringify(typeof fn === "function" ? fn(base) : fn)))) }));
  return id;
}
