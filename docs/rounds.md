# Rounds log (UI/UX intuitiveness, rounds 1-10)
R1 first-time orientation: home shows a one-paragraph "what is this / how to search" with three example searches (App.jsx Browse); check scripts/rounds.mjs 1.
R2 search on every page: compact search box in the header on every page except home and search (App.jsx Header); SearchBox ids made unique with useId; check scripts/rounds.mjs 2.
R3 faceted filters with counts: faculty options show counts, author filter also matches advisers ("Author or adviser"); type/category counts already there; check rounds.mjs 3.
R4 thesis-first cards: big and detail cards show page count and adviser (when the data has one) beside author, year and type; check rounds.mjs 4.
R5 empty states: unknown collection/faculty/type page shows an explanation with links; "did you mean" kept in suggestions and result lists; check rounds.mjs 5.
R6 browse faculty > collection > year: faculty page lists its collections, faculty and collection pages get year chips with counts; also fixed /faculty/* and /type/* routes that fell through to "Page not found"; check rounds.mjs 6.
R7 breadcrumbs + back: item and collection trails now include the faculty; search filters (type, faculty, year, tags, sort...) are kept in memory per query so Back from an item restores them; check rounds.mjs 7.
R8 keyboard map: "/" focuses search, "j"/"k" move between results, "?" opens a shortcut list (also a footer button), Esc closes; ignored while typing; check rounds.mjs 8.
R9 mobile 360px: Sort select and "copy link to section" button raised to touch size; phone.mjs now covers 9 routes (collections, collection, faculty, topics) and passes at W=360; check rounds.mjs 9.
R10 plain-language audit: "semantic search" replaced by "search by meaning" in screens and the consent switch; terms.mjs also bans semantic/corpus/bm25/lexical in .jsx; check rounds.mjs 10.

# Rounds 11-20 (aesthetics)
R11 theme tokens: maroon/green tokens kept; added theme-color meta (#3f0a19) so phone bars match; check rounds.mjs 11.
R12 long titles: h1-h3 text-wrap balance, overflow-wrap anywhere, fluid h1 size (24-36px); 34-word thesis title fits at 1280 and 360; check rounds.mjs 12.
R13 covers: already generated SVG art per faculty/type with zero images; now asserted on home (283 covers, 0 img); check rounds.mjs 13.
R14 motion: cards get press feedback (scale .98); hover lift and reduced-motion off-switch verified; check rounds.mjs 14.
R15 density: third result layout "Compact" (smaller cards) in search and Advanced; check rounds.mjs 15.
R16 icons: Icon set was already one style; asserted (24 grid, currentColor, round caps, aria-hidden); check rounds.mjs 16.
R17 loading: main keeps min-height 70vh so the footer does not jump; verified with a delayed index and the skeleton; check rounds.mjs 17.
R18 print: @media print hides header/footer/nav, white page, link URLs shown; check rounds.mjs 18.
R19 icons: favicon.svg + apple-touch icon (public/, relative hrefs); the social image tag already comes from the seo plugin; check rounds.mjs 19.
R20 contrast: axe on 12 pages, 0 violations, light theme only; check rounds.mjs 20.

# Rounds 21-30 (correctness)
R21 authors: norm_authors.py writes data/author-aliases.json (24 aliases: "Nasser, M" -> "Nasser, Mona", all-caps, unreordered "Given Surname", diacritics "Cabanes"/"Cabañes", "Jr." order); data_checks.py 21 + rounds.mjs 21.
R22 dates: all 785 issued dates are ISO and 1990-2026 (accessioned is not in the harvest, so only issued is checked; none disagree with AY/SY years in titles); data_checks.py 22 + rounds.mjs 22.
R23 types: new "Course module" (3) and "Dataset" (1); an untyped item in a Scholarly Articles collection is an Article; "Other" 94 raw -> 0; data_checks.py 23 + rounds.mjs 23.
R24 duplicates: same title + first author -> dupOf (788/791 same collection, 792/811 article vs thesis copy); item page says "duplicates item N"; data_checks.py 24 + rounds.mjs 24.
R25 no-file states: asserted "No full text available" (16 items, abstract kept), "Full text restricted" (71), no PDF links in the page; rounds.mjs 25.
R26 PDF QA: pdf_qa.py (garble, stale/missed scan flags); found 6 one-page posters (100-200 real words) wrongly flagged "scanned": assemble no longer flags them, chunk.py keeps them on its next run; new scanned note on item pages; rounds.mjs 26.
R27 search eval: eval_set.py builds web/scripts/search-eval-set.json (50 queries from real titles, author+title, subject, abstract phrases); search-eval.mjs reads it (BM25 hit@1 0.86, hit@5 0.96; hybrid 0.76/0.92); rounds.mjs 27.
R28 grounding: ground_check.py (no LLM): every number in a summary occurs in title/abstract/PDF text; 40 summaries, 0 BUG so far; rounds.mjs 28.
R29 citations: MLA and Chicago now cite the DOI link when there is one (as APA did); 6 DOIs were stored as full URLs and are now bare (assemble.py); cite-check.mjs 13 checks incl. every item x 3 styles; rounds.mjs 29.
R30 links: link_check.py (format check on all items, then HEAD sample at <= 1.7 req/s, 404/410 = BUG, other statuses WARN); sample 8 handles + 5 DOIs OK; rounds.mjs 30.
Adviser UI removed (0/785 values): card line, item line, filter label "Author", search scope text, consent/SEO copy. Not repurposed: local.intellectualpropertycode would need one API call per item.

# Rounds 31-40 (security and privacy)
R31 CSP: meta CSP already had no unsafe-inline/unsafe-eval (style hashes only); now asserted, plus an e2e securitypolicyviolation listener on 7 routes and "only localhost requests at load, no Tag Manager in the bundle"; rounds.mjs 31.
R32 consent: asserted that before any choice nothing is stored (localStorage, cookies, IndexedDB, caches, service worker) and consent-audit.mjs runs in the round; rounds.mjs 32.
R33 sanitise: sanitise-fuzz.mjs feeds hostile strings (img onerror, script, javascript:, markdown, template syntax) into every string of articles/texts/FAQs through route interception; no innerHTML in src; built pages only have ld+json and r.js scripts; rounds.mjs 33.
R34 params: fuzz-inputs.mjs (hostile hashes, poisoned localStorage for every key) wired into the round; rounds.mjs 34.
R35 links: repoUrl now allows only https://repository.upou.edu.ph/handle/...; href-allowlist.mjs checks article url/doi, every href/src in built HTML, and rendered links on 20 routes (external = noopener noreferrer); rounds.mjs 35.
R36 dependencies: exact pins (deps.mjs), npm audit moderate, Dependabot now weekly and grouped for npm and Actions; rounds.mjs 36.
R37 privacy: notice cites the Data Privacy Act of 2012; UPOU operator and DPO placeholders asserted as marked [..]; rounds.mjs 37.
R38 copyright: PDF passages no longer built into dist (seo.mjs), UI degrades to abstract/summary excerpts, fulltext_check.py (30 PDFs, 12-word runs) over dist and git; docs/hosting.md records the decision; rounds.mjs 38.
R39 service worker: caches only 200 same-origin non-redirected responses without a query string (a ?poison= request is not stored), precache has no passages/vectors; runtime check; rounds.mjs 39.
R40 workflow: build job contents: read only (provenance attestation step removed because it needs id-token on build), pages/id-token write only on deploy, actions pinned @vN, SITE_URL from repo variable; rounds.mjs 40.

# Rounds 41-50 (speed)
R41 startup data: articles.json carried 1.36 MB of full abstracts (427 KB gz); now truncated to 400 chars there and the full text rides in texts.json (after first paint). Before first paint 844 -> 449 KB gz, home transfer 782 -> 453 KB, LCP 4.7 -> 3.0 s at 4x CPU; new scripts/budget.mjs (budget 500 KB gz); rounds.mjs 41.
R42 lazy worker/model: asserted that with no choice or prefs-only, home and search fetch no transformers, vectors, wasm, onnx or CDN file (only the lexical worker); rounds.mjs 42.
R43 vectors: vecs.bin float32 15.3 MB -> int8 3.8 MB (scripts/quantize-vecs.mjs, run by `npm run index`; engine reads both, IndexedDB copy keyed by size); hybrid hit@1/@5 unchanged-or-better (0.78/0.94 vs 0.76/0.92); assemble.py and audit.py read int8; rounds.mjs 43.
R44 fonts/images: home loads 4 latin woff2 (+1 latin-ext when a title needs a glyph), preloaded, font-display swap, zero raster images; rounds.mjs 44.
R45 long lists: the 785-item browse list is 24 cards + "Show more" with content-visibility on cards; asserted 24 items in the DOM; rounds.mjs 45.
R46 service worker: index data is now stale-while-revalidate (cache per build), hashed assets cache-first, precache 973 KB gz under a 1400 KB budget; rounds.mjs 46.
R47 perf: perf.mjs re-measured at 4x CPU (LCP 2.6-3.0 s, CLS 0-0.004, TBT 0-439 ms, INP 48-144 ms, 453 KB), budgets tightened (LCP 3500, 700 KB); Search facet lists (years, categories, collections, faculties) memoised; home skips the re-render when texts.json arrives; rounds.mjs 47.
R48 latency: scripts/latency.mjs on dist data, lexical p50 2 / p95 7 ms, hybrid p50 11 / p95 17 ms (budgets 100 / 400); rounds.mjs 48.
R49 bundle + ranking: bundle.mjs and "search loads no Graph3D/Maps/Advanced" asserted (entry 81 KB gz); hybrid RRF retuned (vector list weight 0.35, k 10): hit@1 0.76 -> 0.86, hit@5 0.92 -> 0.94 (BM25 alone 0.86 / 0.94); search-eval defaults now gate 0.85 / 0.93; rounds.mjs 49.
R50 gate + handoff: docs/handoff.md (built, rebuild, pending, human tasks) asserted by rounds.mjs 50; full gate: e2e 30/0, a11y 12 pages 0 violations, terms 0 hits, consent-audit 75/0, third-party 7/0, phone 9 routes 0 overflow, npm audit 0, fulltext_check 0 BUG, deps 454/0.

# Round 51
R51 auto tags and sub-topics: tag_items.py (local Gemma, 5-8 grounded keyword tags per item) + tags_build.py (normalise, merge, drop ungrounded/generic, keep tags used by >=2 items plus up to 3 item-specific) + 33 sub-topics (subtopics_def.py) and a top-level category for every item; `subjects` merged with `autoTags`, new `subtopics`; reader rows with AI labels, /sub/<slug>, Topics grouping, type-ahead and Advanced "Sub-topic" facet; tags_check.py gate (>=4 tags, category, sub-topic, grounded 100%, none in >40%); rounds.mjs 51.

# Round 52
R52 advisers and committee search: /advisers + /adviser/<slug>, people index (people.json/people.bin), expertise profiles with why-text, opt-in meaning match with word fallback, committee panel 3 or 4 with coverage matrix, tabs per candidate topic via pref, topic discovery, Maps add-to-committee; adviser_check.py (held-out title hit@3 0.47, sub-topic hit@3 1, multi-topic coverage 1, 0 BUG); rounds.mjs 52 22/0; e2e 31/0, a11y 14 pages 0 violations, phone 10 routes 0 overflow, budget 5/0 (startup 490 KB gz), third-party 7/0, href-allowlist 4/0, terms 0 hits.

# Round 53
R53 faculty folder, IJODeL articles, evidence-mix scoring: AI `half` summaries moved out of the startup articles.json into half.json (startup 631 -> 469 KB gz after a full assemble); `web/public/faculty/` with schema README, name-change fields (former_names, title, aliases, not_same_as, redirect of old slugs), people-merge.mjs build step, faculty_check.mjs gate; IJODeL snapshot matched to people by name rules (ambiguous never merged) and shown as "From IJODeL" on profiles; scoring.js (international > own > advisee, log-capped), chair chosen by match x international x track record, evidence-mix bars, include-former toggle, status badges; Joete/Joefe Santarita reader link resolved by redirect, Lumanta OCR split merged by a faculty file; rounds.mjs 53.

# Round 54
R54 adviser privacy and writeups: banner + live network panel + counter 0 (23 checks: all requests GET without body, token never in URL/headers/body, CSP unchanged), writeup toggle/copy/print/absent/override labels, Maps Adviser seed and links, BM25 for new faculty and External status (fixture in advisers-eval). Gate: rounds 52-54 0 FAIL, adviser_check 0 BUG, startup 469 KB gz.
R55 access gate: adviser data encrypted at build (AES-256-GCM, PBKDF2 key with its own salt, opaque file names, names removed from public articles.json), browser login against k.json with in-memory key and Lock, restricted routes/tab/Adviser map seed/reader line hidden when locked, CI passes ADV_USER/ADV_PASS to the build step only, docs/access.md with limits; access-check.mjs 18/0, rounds.mjs 52-55 74/0, e2e 32/0, a11y 16 pages 0 violations.

# Rounds 56-75 (advisers; numbered after the existing 51-55)
R56 empty name search: "Nobody matches" state with Clear button. R57 name search also matches former names, accent-insensitive. R58 "Show 30 more" instead of a silent cut at 30. R59 hint to add a topic when none. R60 "Match: N% of the best match" on each ranked person. R61 coverage table: legend, focusable labelled scroll region, sticky name column. R62 no-coverage topic: explicit "no panel can be suggested" and empty people state. R63 duplicate topics ignored, six-topic limit note. R64 Add to panel announced, full panel (5) disables Add. R65 Remove returns focus to the panel and is announced. R66 /adviser/<slug> shows an error when people data fails. R67 failed writeup load is not cached as "none" and is retried. R68 "and N more" link when a person has more than 2 matching items. R69 tab buttons carry full name as title. R70 adviser page sets tab title. R71 ranking monotone check (two topics). R72 default panel has no former/external person. R73 phone 390px no overflow, buttons >= 36px. R74 Backspace in the empty topic box removes the last topic. R75 speed: second topic re-ranks in < 2.5 s. Checks in rounds.mjs 56-75; no new stored keys.
