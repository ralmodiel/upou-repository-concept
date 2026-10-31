# UPOU Repository concept (proof of concept)

A static, all-in-browser search and browse layer over the 785 records of the UP Open University repository (https://repository.upou.edu.ph, DSpace 7). Browse by collection, faculty, type, topic and tag; keyword + semantic search; maps of related items; view lists. Full texts stay in the official repository and every item links back to it. Summaries, Q&As, tags and related-reading notes are AI-generated and must not be cited. Not an official UPOU site.

## Run, build, test (in `web/`)

```sh
npm ci
npm run dev                        # dev server
npm run build                      # -> web/dist (also writes read/<id>/ pages, sitemap.xml, robots.txt, 404.html)
npx vite preview --port 4195       # serve dist for the browser tests
node scripts/a11y.mjs              # axe on key pages
node scripts/phone.mjs             # phone-width layout audit
node e2e/ui.mjs                    # end-to-end UI tests (needs preview on :4195)
node scripts/search-eval.mjs       # search-quality eval (50 queries)
node scripts/rounds.mjs [n...]     # the checks of the 50 improvement rounds (see docs/rounds.md)
node scripts/deps.mjs              # dependency policy: exact pins, lockfile, licences, unused deps, audit (also in CI)
node scripts/consent-audit.mjs     # storage keys per consent state vs the privacy notice (needs preview)
```

## Data pipeline (repo root, Python; local only)

The crawl and local-LLM scripts (`harvest.py`, `fetch_pdfs.py`, `ocr.py`, `summarize.py`, `categorize.py`, `assemble.py`, ...) and their intermediate files in `data/` are git-ignored and not committed. See `docs/handoff.md` for the order to run them. Their output lands in `web/public/index/`, which is committed so the site builds without the pipeline.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` builds `web/` on push to `main` and publishes `web/dist`. In the repo settings set Pages source to "GitHub Actions" and add a repository variable `SITE_URL` (e.g. `https://<user>.github.io/<repo>`). Without it, canonical/sitemap URLs use the placeholder `https://ralmodiel.github.io/upou-repository-concept`.

### Security headers for the final host

The page sets its CSP in a `<meta>` tag (`default-src 'self'`, no `unsafe-inline`; three `sha256-` hashes cover the fixed `<style>` blocks the 3D-map libraries inject — an upgrade of `3d-force-graph` can change them, and `e2e/ui.mjs` then fails "no CSP violations"). A meta CSP cannot set `frame-ancestors`, reporting or other headers, so the host should send:

```
Content-Security-Policy: frame-ancestors 'none'   (plus the same policy as the meta tag, if the host can)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

GitHub Pages cannot send custom headers. `vecs.bin` and `.wasm` should be served with `Content-Type: application/octet-stream` / `application/wasm`.

Third parties: the semantic-search model comes from `huggingface.co` (and its `*.hf.co` CDN), the ONNX runtime wasm from `cdn.jsdelivr.net` pinned to the exact `onnxruntime-web` version. `ORT_SELF=1 npm run build` copies the runtime into `dist/ort/` (~41 MB) instead, and jsDelivr can then be dropped from `connect-src`. If either host is blocked, search falls back to keyword (BM25) only and says so.

## Privacy

No analytics or advertising of its own. Opt-in consent covers storing lists/filters on the device, downloading the search model from Hugging Face. See `#/privacy` (draft pending the university's data protection review).

## Limits

- Thesis full text is not shipped (`docs/hosting.md`); summaries, tags and OCR-based search text are still being generated locally (`docs/handoff.md`).
- Hash routing: only the static `read/<id>/` pages are crawlable.
