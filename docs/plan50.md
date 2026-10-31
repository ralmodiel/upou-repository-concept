# UPOU Repository concept: 50-round improvement plan

POC of an all-frontend replacement/overlay for https://repository.upou.edu.ph (DSpace 7, 785 items: 469 theses, student papers,
scholarly articles, presentations). Static React + Tailwind on GitHub Pages, no backend,
precomputed index (BM25 + bge-small vectors in a Web Worker), local-LLM summaries/notes/FAQs, opt-in consent, Netflix-style home.
Mapping: Faculty (community) -> Collection -> Item. Row/shelf per collection; item types: Thesis, Article, Student paper,
Presentation, Report, Other. Never use the word "publication" for an item; say "work" or the item type.
Each round = one small change + one check (script or e2e step) + one line in docs/rounds.md. Gate at landing, not per round.

## Phase 0: foundation (before round 1)
- Data: harvest.py (done, DSpace REST), fetch_pdfs.py (running), chunk.py, embeddings/index build, assemble.py, categorize.py
  (topics per faculty), summarize.py (half/one/two), related.py, faqs.
- Port the web app: collections replace issues, faculty replaces category tabs, type chips, adviser field, DOI/handle links,
  repository fonts/theme, "Open original in repository" link, no cover art (generated covers by type/faculty).

## Rounds 1-10: UI/UX intuitiveness
1 first-time orientation (what is this, how to search) 2 search box on every page with scoped suggestions 3 faceted filters (faculty,
type, year, adviser, topic) with counts 4 thesis-first result cards (author, adviser, year, pages) 5 clear empty states and
"did you mean" 6 browse by faculty > collection > year 7 breadcrumbs + back that restores scroll/filters 8 keyboard map (/, j/k, ?)
9 mobile layout pass (360px) 10 plain-language labels audit (terms script: user-visible banned words).

## Rounds 11-20: aesthetics
11 theme tokens from the repository's colours/fonts 12 typography scale for long titles (theses have 20+ word titles)
13 generated covers per type/faculty (no photos) 14 home rows with focus/hover motion, reduced-motion respected 15 density toggle
16 consistent icon set 17 skeleton loaders, no layout shift 18 print stylesheet for a record page 19 social image + favicon + app icon
20 contrast pass (axe 0 serious) in light theme only (no dark mode, per the owner).

## Rounds 21-30: correctness
21 author-name normalisation (alias file, "Surname, Given" variants) 22 date/year sanity (dc.date.issued vs accessioned) 23 type
normalisation ("Technical report." etc.) 24 dedupe items by title+author 25 items without a PDF: honest "no full text" state, still searchable
by abstract 26 PDF text extraction QA (scanned theses with no text layer: flag, OCR later) 27 search eval set (50 queries, hit@1/@5)
28 summary/FAQ grounding judge (drop unsupported answers) 29 citation formats (APA/MLA/Chicago) from DSpace
metadata + DOI 30 link checker (handle, DOI, PDF) in CI script.

## Rounds 31-40: security and privacy
31 CSP meta (no unsafe-inline), SRI for any third-party script, no third-party requests at load (the source site loads Google Tag
Manager; ours must not) 32 consent model: all opt-in, only the choice record stored 33 sanitise every harvested string (no HTML
from the source is ever injected) 34 URL/hash parameter validation + fuzz script 35 PDF links open noopener noreferrer, only
repository.upou.edu.ph handles/bitstreams allowed 36 dependency pinning + audit (npm audit, Dependabot grouped) 37 privacy notice
(DPA 2012, placeholders for UPOU operator/DPO) 38 thesis-sensitivity review: never publish items whose files are restricted; check
that data/ and PDFs stay out of the public repo (copyright: link to the repository for full text) 39 service worker scope and
cache poisoning review 40 workflow permissions least-privilege (pages.yml).

## Rounds 41-50: speed
41 chunked data (articles/faqs/vectors loaded lazily, route-split) 42 worker warm-up + model download only on good devices (device.js)
43 vectors int8 / smaller dims, index size budget script 44 image/cover generation as CSS/SVG, zero image bytes on home
45 virtualised long lists (785 items) 46 cache strategy: SW precache of shell, stale-while-revalidate for index 47 LCP/CLS/INP budgets
in perf.mjs 48 search latency p95 under 100 ms (lexical) / 400 ms (hybrid) 49 bundle analysis, drop unused code 50 full gate: e2e,
consent audit, a11y, phone, perf, third-party, search-eval; final handoff doc.
