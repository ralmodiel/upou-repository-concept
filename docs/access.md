# Access gate for the adviser and committee features

The Advisers pages (`#/advisers`, `#/adviser/<slug>`, `#/maps/adviser/<slug>`), the "Adviser" line on the reader, the Adviser map seed and the "Also an adviser" link are restricted. Everything runs in the browser; there is still no server.

## How it works
- `web/public/index/k.json` (public, committed) holds `{salt, salt2, iter, hash}`. `hash` = PBKDF2-SHA256(lowercase(user) + ":" + password, salt, 600000 iterations, 32 bytes). No username or password is inside.
- Build: `npm run build` = people-merge, then `node scripts/encrypt-dist.mjs --check` (fails fast), vite build, then `node scripts/encrypt-dist.mjs`. The build step reads `ADV_USER` and `ADV_PASS` from the environment, checks them against k.json, derives an AES-256-GCM key (PBKDF2 with the separate `salt2`, same iterations, 64 bytes: 32 for AES, 32 for an HMAC that names the files) and encrypts every adviser-only file under `dist/index/a/<hmac>.enc` (fresh 12-byte IV per file, GCM tag, the logical file name is authenticated data so files cannot be swapped). File names reveal nothing. A wrong or missing secret fails the build with a message, so a site nobody can open is never deployed.
- Encrypted: people.json, people.bin, international.json, per-person IJODeL summaries, profiles/writeups, the IJODeL article list, and the adviser names of every item (taken out of the public `articles.json`; they travel as an encrypted id-to-names map). `dist/faculty/` is removed. A production build never contains these in plaintext (`node scripts/access-check.mjs` verifies it).
- Browser: `src/accessCrypto.js` (WebCrypto, shared with the build script), `src/access.js` (in-memory key, login, Lock), `src/Login.jsx` (form, Gate), `src/adviserData.js` (the one door: decrypts). The key lives in a module variable only: no localStorage, sessionStorage, cookie or URL. Reload, Lock or closing the tab forgets it. Lock also wipes the decrypted data and the adviser names from the reader. After a failed login there is a growing delay (client side, honest: it is not security).
- Login is checked in your browser; nothing is sent. The only requests are GETs for k.json and the `.enc` files (the network counter stays 0).
- Local dev: `npm run dev` has no encryption and no login (plaintext from `public/`; dev mode only, `import.meta.env.DEV`). A production build (`npm run build`) always requires the credentials, also locally.

## One-time setup (GitHub)
1. Repository > Settings > Secrets and variables > Actions > New repository secret: name `ADV_USER` (the username), then again `ADV_PASS` (the password). They must be the pair that k.json was generated from.
2. Deploy: push to main (or run the "Deploy to GitHub Pages" workflow). The workflow passes the two secrets only to the build step and fails with a message if either is empty or wrong.
3. Open `<site>/#/advisers` and sign in. The username is not case sensitive.

## Rotate
```
cd web && node scripts/access-init.mjs <new-user> <new-password>   # rewrites public/index/k.json (new salts)
git add public/index/k.json && git commit        # k.json is public by design
```
Then update both secrets (ADV_USER and ADV_PASS) and redeploy. Do the secrets before the push, or the deploy fails with the mismatch message (which is the intended safety net). Local build and gates: set `ADV_USER` and `ADV_PASS` inline in the command only, never in a file.

## Gates (creds from env)
`ADV_USER=.. ADV_PASS=.. node scripts/access-check.mjs` (static: no plaintext, names, expertise text or credentials in dist or git; wrong or missing secret fails the build; tamper test), `node scripts/rounds.mjs 55` (browser: locked pages, wrong password, unlock, Lock, network counter). The other browser gates sign in through `scripts/adv-test.mjs`.

## LIMITS (honest)
- Client-side login is not server-side access control. Whoever can open the site can download the ciphertext and try passwords offline. k.json is public with its salt and iteration count, so a short or guessable password can be brute-forced (600000 PBKDF2 rounds slow this down, they do not stop it). Use a long password. Once someone knows the password they can read everything, and a screenshot or copied text cannot be recalled.
- Rotating the password does not protect copies of older ciphertext made under the old one.
- The plaintext sources are in the repository: `web/public/faculty/*.json`, `web/data/*` and the committed `web/public/index/{people.json,people.bin,international.json,ijodel/,articles.json (with adviser names)}`. In a PUBLIC repository anyone can read them. The gate protects the published site only. Keep the repository private, or keep that plaintext out of the public repo (for example git-ignore it and supply it at build time from a private store). The built `dist/` does not contain them. Not moved in this phase because the root `*.py` writers (git-ignored) write to those paths; moving them is a separate decision.
- Adviser names are still public in the built site as theses' authors where the person is also an author, and wherever the repository itself lists them.
- Dev mode (`npm run dev`) has no gate.
- The service worker may cache the ciphertext files; they are unreadable without the key. Decrypted data is never cached.
