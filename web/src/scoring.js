// Evidence-mix scoring constants for /advisers: the ONLY place to tune weights. Pure, no DOM. Documented in docs/handoff.md.
// A person's evidence for one topic comes from four sources. Each source has a match quality m in 0..1 (quality(): the best matching item and the
// mean of the top 3, each item's match 0..1 x recency factor), and contributes  W * m. Quality of match, not the number of theses: items past the third add nothing.
// Order of weights: international > own works > advisees (asserted by adviser_check.py via scripts/advisers-eval.mjs).
export const W = { adv: 1, own: 1.2, intl: 1.6, ij: 1.4, exp: 1 };   // exp (round 54): a person with typed expertise text and no items yet, scored by BM25 on that text; the other four weights are unchanged; priority: international (Springer-type) 1.6 > IJODeL 1.4 > own works (staff articles) 1.2 > advisees (student theses) 1; an IJODeL article is international by definition but ranks just below a flagged one
export const RECENCY_FLOOR = 0.6;                            // mild decay for item scoring: the oldest data year counts 0.6, the newest 1
export const TRACK_TAU = 5;                                  // track record: an advised thesis loses weight as exp(-(LASTYEAR - year) / 5), data years
export const CHAIR_INTL = 1.5;                               // chair score x (1 + 1.5 x international share): internationals count even more for the chair
export const SRC = ["adv", "own", "ij", "intl", "exp"];             // evidence-mix order: advisees / own works / IJODeL / international (repository articles flagged international)
export const SRC_LABEL = { adv: "Advisees", own: "Own works", ij: "From IJODeL", intl: "International works", exp: "Expertise text" };

export const contrib = (m, src) => (m > 0 ? W[src] * Math.min(1, m) : 0);
// match quality of a source from its items' scores (0..1 each): half the best one, half the mean of the top 3 (missing slots count 0)
export const quality = (xs) => { const s = [...xs].sort((a, b) => b - a); return s.length ? (s[0] + (s[0] + (s[1] || 0) + (s[2] || 0)) / 3) / 2 : 0; };
export const recency = (year, minY, span) => RECENCY_FLOOR + (1 - RECENCY_FLOOR) * Math.min(1, Math.max(0, ((year || minY) - minY) / span));
// Track record of a person: log-scaled, recency-decayed count of advised theses (raw; buildPeople normalises by the maximum over all people). Breaks exact chair ties only.
export const trackRaw = (advYears, lastYear) => Math.log1p(advYears.reduce((s, y) => s + (y ? Math.exp(-Math.max(0, lastYear - y) / TRACK_TAU) : 0), 0));
// intl share 0..1 for the chair: international contribution over the maximum it could add for the topics
export const intlShare = (intlSum, nTopics) => Math.min(1, intlSum / (nTopics * W.intl));
export const chairScore = (match, intl) => match * (1 + CHAIR_INTL * intl); // no thesis-count factor: track record only breaks exact ties (panel())
