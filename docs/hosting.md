# Hosting and copyright decision (round 38)

Decision (confirmed by the owner 2026-10-30: the site only points back to the original repository for the full paper): **the public site and the public git repository do not contain thesis full text.**

- `data/` (harvest, PDFs in `data/pdf`, OCR, chunks, summaries) is git-ignored (`/data/`). PDFs are never copied into `web/public` or `dist`.
- `web/public/index/passages.json` (about 22 MB of PDF text, one chunk per embedding row) is git-ignored and is rebuilt locally by `passages.py` for development only.
  The build (`web/scripts/seo.mjs`) deletes it from `dist/` and no longer writes `dist/index/pass/<id>.json`. Local dev (`vite`) and `search-eval.mjs` still read it if it exists.
- Shipped derived data: `articles.json` (harvested metadata and abstracts, which the UPOU repository publishes), `texts.json` (AI summaries), `chunks.json` (article id per vector row, no text), `vecs.bin` (embedding vectors, no text), `faq/*.json` (AI Q&A).
  Embedding vectors of passages are numbers, but they are derived from the thesis text; if UPOU objects to that, drop `vecs.bin` and the app falls back to keyword search (title, abstract, summaries).
- The check `fulltext_check.py` (sample of 30 PDFs, 12-word runs, dist plus git-tracked files; runs that also occur in the item's own title/abstract are ignored) fails the round-38 check when any PDF text is found. Run: `python fulltext_check.py 12 30` (needs pymupdf).
- Effect on the UI: search cards show the abstract (or the AI summary) excerpt; the "Best passage" box and the reader's "From your search" passage are absent and the reader says the passage could not be loaded. Ranking is unchanged (keyword search never used the passages; the vectors stay).
- Every item links to the official record at repository.upou.edu.ph, where the full text is held (or restricted).

To publish passages later (only with UPOU's written permission): remove the `rmSync` of `passages.json` and restore the `index/pass` loop in `seo.mjs`, and take the file out of `.gitignore`.

Hosting headers: GitHub Pages cannot set HTTP headers, so the CSP is the meta tag in `web/index.html`; `dist/_headers` (Netlify/Cloudflare style) adds the same CSP plus `frame-ancestors`.
`SITE_URL` (repo variable) sets canonical and sitemap URLs. The default in `seo.mjs` (`https://ralmodiel.github.io/upou-repository-concept`) was not verified against a real remote (this clone has none); set the variable for the real deployment.
