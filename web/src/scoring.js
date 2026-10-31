// Evidence-mix scoring constants for /advisers: the ONLY place to tune weights. Pure, no DOM. Documented in docs/handoff.md.
// A person's evidence for one topic comes from four sources. Each source has a match mass m (sum over matching items of match 0..1 x recency
// factor), and contributes  W * min(1, log1p(m) / log1p(CAP)): log-scaled, and capped at W so no single source can dominate.
// Order of weights: international > own works > advisees (asserted by adviser_check.py via scripts/advisers-eval.mjs).
export const W = { adv: 1, own: 1.2, intl: 1.6, ij: 1.4, exp: 1 };   // exp (round 54): a person with typed expertise text and no items yet, scored by BM25 on that text; the other four weights are unchanged; priority: international (Springer-type) 1.6 > IJODeL 1.4 > own works (staff articles) 1.2 > advisees (student theses) 1; an IJODeL article is international by definition but ranks just below a flagged one
export const CAP = { adv: 20, own: 8, intl: 6, ij: 6, exp: 1 };      // matching items at which a source is saturated (exp: its mass is already a 0..1 BM25 share) (tuned so the advisee signal still ranks: see docs/handoff.md)
export const RECENCY_FLOOR = 0.6;                            // mild decay for item scoring: the oldest data year counts 0.6, the newest 1
export const TRACK_TAU = 5;                                  // track record: an advised thesis loses weight as exp(-(LASTYEAR - year) / 5), data years
export const TRACK_FLOOR = 0.5;                              // chair factor from track record is 0.5 (no recent advising) .. 1 (the most active adviser)
export const CHAIR_INTL = 1.5;                               // chair score x (1 + 1.5 x international share): internationals count even more for the chair
export const SRC = ["adv", "own", "ij", "intl", "exp"];             // evidence-mix order: advisees / own works / IJODeL / international (repository articles flagged international)
export const SRC_LABEL = { adv: "Advisees", own: "Own works", ij: "From IJODeL", intl: "International works", exp: "Expertise text" };

export const contrib = (m, src) => (m > 0 ? W[src] * Math.min(1, Math.log1p(m) / Math.log1p(CAP[src])) : 0);
export const recency = (year, minY, span) => RECENCY_FLOOR + (1 - RECENCY_FLOOR) * Math.min(1, Math.max(0, ((year || minY) - minY) / span));
// Track record of a person: log-scaled, recency-decayed count of advised theses (raw; buildPeople normalises by the maximum over all people).
export const trackRaw = (advYears, lastYear) => Math.log1p(advYears.reduce((s, y) => s + (y ? Math.exp(-Math.max(0, lastYear - y) / TRACK_TAU) : 0), 0));
// intl share 0..1 for the chair: international contribution over the maximum it could add for the topics
export const intlShare = (intlSum, nTopics) => Math.min(1, intlSum / (nTopics * W.intl));
export const chairScore = (match, intl, track) => match * (1 + CHAIR_INTL * intl) * (TRACK_FLOOR + (1 - TRACK_FLOOR) * track);
