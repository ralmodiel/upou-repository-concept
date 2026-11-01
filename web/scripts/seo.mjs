// Build-time SEO: static read pages, sitemap, robots, 404 (hash routing is invisible to crawlers). SITE_URL env sets absolute URLs.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";
export const SITE = (process.env.SITE_URL || "https://ralmodiel.github.io/upou-repository-concept").replace(/\/+$/, ""); // default is the current POC Pages URL: set SITE_URL for the UPOU deployment
const NAME = "UPOU Repository (proof of concept)";
const DESC = "Find theses, student papers, scholarly articles and presentations from UP Open University by topic, faculty, collection and author. Every record links to the official UPOU Repository.";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n = 155) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…"; };
const m = (k, v, a = "name") => `<meta ${a}="${k}" content="${esc(v)}">`;
const IMG = () => [m("og:image", SITE + "/img/social.png", "property"), m("og:image:width", "1200", "property"), m("og:image:height", "630", "property"), m("og:image:alt", "The UPOU Repository concept home page", "property"), m("twitter:image", SITE + "/img/social.png")].join("\n");
const head = (title, desc, url) => [`<title>${esc(title)}</title>`, m("description", desc), `<link rel="canonical" href="${url}">`,
  m("og:type", "article", "property"), m("og:site_name", "UPOU Repository", "property"), m("og:title", title, "property"), m("og:description", desc, "property"), m("og:url", url, "property"),
  m("twitter:card", "summary_large_image"), IMG(), m("twitter:title", title), m("twitter:description", desc)].join("\n");
export const homeTags = () => [...["articles"].map((f) => `<link rel="preload" as="fetch" href="./index/${f}.json" crossorigin>`), m("description", DESC), `<link rel="canonical" href="${SITE}/">`, m("theme-color", "#8a1538"),
  m("og:type", "website", "property"), m("og:site_name", "UPOU Repository", "property"), m("og:title", `UPOU Repository — find theses, papers and presentations`, "property"), m("og:description", DESC, "property"), m("og:url", SITE + "/", "property"),
  m("twitter:card", "summary_large_image"), IMG(), m("twitter:title", "UPOU Repository"), m("twitter:description", DESC),
  `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "UPOU Repository", url: SITE + "/", potentialAction: { "@type": "SearchAction", target: `${SITE}/#/search/{search_term_string}`, "query-input": "required name=search_term_string" } })}</script>`].join("\n");
// advisers are access-gated: a summary that copied them from the acknowledgements must not name them (people who are also authors stay public). Also used by seal-snapshot.mjs.
export function advScrub(people) {
  const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), PL = people.filter((x) => x.adv.length && !x.aut.length);
  const scrubRe = new RegExp("(?:(?:Dr|Prof|Atty|Engr|Asst|Assoc)\\.? ?)*(?:" + PL.map((x) => reEsc(x.n)).sort((p, q) => q.length - p.length).join("|") + ")", "gi");
  return (t) => typeof t === "string" ? t.replace(scrubRe, "a committee member") : t;
}

export function seoPlugin() {
  let outDir;
  return {
    name: "upou-seo", apply: "build",
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); }, // vite build --outDir <elsewhere> (scratch checks) writes there, not into web/dist
    transformIndexHtml: { order: "post", handler: (h, ctx) => h.replace("</title>", "</title>\n" + homeTags() + "\n" + // first-screen fonts: found late in the CSS otherwise, and their swap shifts the layout
      Object.keys(ctx.bundle || {}).filter((f) => /(lato-latin-(400|700)|merriweather-latin-(300|400))-normal-.*\.woff2$/.test(f)).map((f) => `<link rel="preload" as="font" type="font/woff2" href="./${f}" crossorigin>`).join("\n")) },
    closeBundle() {
      const dist = outDir;
      const arts = JSON.parse(readFileSync(join(dist, "index/articles.json"), "utf8"));
      // startup diet: the half, 1-page and 2-page AI summaries (~60% of the file) load apart (1 and 2 page: texts.json via engine.js textsP; half: half.json via S.half, on first search, AI summary or an abstract-less card)
      const PJ = join(import.meta.dirname, "..", "public/index/people.json");
      const scrub = existsSync(PJ) ? advScrub(JSON.parse(readFileSync(PJ, "utf8"))) : (console.log("seo: no adviser plaintext (ciphertext-only checkout): summaries and FAQs come pre-scrubbed from web/sealed"), (t) => t);
      for (const a of arts) for (const k of ["half", "one", "two", "abstract"]) a[k] = scrub(a[k]);
      const texts = {}; for (const a of arts) { texts[a.id] = { one: a.one, two: a.two, abstract: a.abstract }; }
      writeFileSync(join(dist, "index/half.json"), JSON.stringify(Object.fromEntries(arts.filter((a) => a.half).map((a) => [a.id, a.half])))); // AI half-page summaries: lazy, keyed by id, not precached
      writeFileSync(join(dist, "index/texts.json"), JSON.stringify(texts));
      // related "why" notes (~0.7 MB raw) load after first paint with texts.json (engine.js textsP)
      writeFileSync(join(dist, "index/why.json"), JSON.stringify(Object.fromEntries(arts.filter((a) => a.related?.some((r) => r.why)).map((a) => [a.id, Object.fromEntries(a.related.filter((r) => r.why).map((r) => [r.id, r.why]))]))));
      for (const a of arts) a.related = (a.related || []).map(({ why, ...r }) => r);
      // per-article FAQs (engine faqsFor); every article gets a file, [] if empty. Round 38: PDF passages are thesis full text (copyright) and are never shipped: passages.json is deleted below and index/pass/ is not written
      const J = (f) => { try { return JSON.parse(readFileSync(join(dist, "index", f), "utf8")); } catch { return []; } }, faqs = J("faqs.json"); // missing optional files = no passages yet
      const hasQ = new Set(faqs.map((f) => f.article)); // R290: noFaq lets the reader drop its Questions jump link without fetching the lazy FAQ file
      // cards clip at <= 380 chars; the full abstract arrives with texts.json
      writeFileSync(join(dist, "index/articles.json"), JSON.stringify(arts.map(({ half, one, two, ...a }) => ({ ...a, abstract: (a.abstract || "").length > 400 ? a.abstract.slice(0, 400).replace(/\s\S*$/, "") : a.abstract, ...(hasQ.has(a.id) ? {} : { noFaq: true }) }))));
      for (const d of ["faq"]) mkdirSync(join(dist, "index", d), { recursive: true });
      for (const a of arts) {
        writeFileSync(join(dist, "index/faq", a.id + ".json"), scrub(JSON.stringify(faqs.filter((f) => f.article === a.id))));
      }
      // faculty folder is published as is, except example files ("example": true) which are not part of the site
      const fd = join(dist, "faculty"); if (existsSync(fd)) for (const f of readdirSync(fd).filter((x) => x.endsWith(".json"))) { try { if (JSON.parse(readFileSync(join(fd, f), "utf8")).example === true) rmSync(join(fd, f)); } catch {} }
      for (const f of ["passages.json", "faqs.json"]) rmSync(join(dist, "index", f), { force: true });
      // round 83: offline service worker, versioned by the entry chunk name; registered only under the "prefs" consent (src/sw-reg.js)
      const assets = readdirSync(join(dist, "assets")).filter((f) => /\.(js|css)$/.test(f) && !/Graph3D|transformers/.test(f) || /(lato-latin-(400|700)|merriweather-latin-(300|400))-normal-.*\.woff2$/.test(f));
      const pre = ["./", "index/articles.json", "index/chunks.json", "index/texts.json", ...assets.map((f) => "assets/" + f)];
      const ver = (readFileSync(join(dist, "index.html"), "utf8").match(/assets\/index-([^".]+)\.js/) || [, Date.now()])[1];
      writeFileSync(join(dist, "sw.js"), readFileSync(join(import.meta.dirname, "sw.tpl.js"), "utf8").replace("__VER__", ver).replace("[/*PRE*/]", JSON.stringify(pre)));
      // external redirect file: inline script would need a CSP hash
      writeFileSync(join(dist, "r.js"), `var s=document.currentScript;location.replace(s.src.replace(/r\\.js$/,"")+"#/read/"+s.dataset.id);\n`);
      const csp = readFileSync(join(import.meta.dirname, "..", "index.html"), "utf8").match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)[0];
      // round 88: Trusted Types stay report-only (worker URL, three/3d-force-graph innerHTML break under enforcement)
      // rounds 86/93: response headers for hosts that read a _headers file (Netlify, Cloudflare Pages); GitHub Pages ignores it (docs/hosting.md)
      const pol = csp.match(/content="([^"]*)"/)[1] + "; frame-ancestors 'none'; upgrade-insecure-requests";
      writeFileSync(join(dist, "_headers"), `/*\n  Content-Security-Policy: ${pol}\n  Content-Security-Policy-Report-Only: require-trusted-types-for 'script'\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), interest-cohort=()\n  Cross-Origin-Opener-Policy: same-origin\n Cross-Origin-Resource-Policy: same-origin\n  X-Frame-Options: DENY\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/index/*\n  Cache-Control: public, max-age=3600, stale-while-revalidate=86400\n/index/k.json\n  Cache-Control: no-cache\n  X-Robots-Tag: noindex\n/index/a/*\n  X-Robots-Tag: noindex\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n`);
      const urls = [SITE + "/"];
      for (const a of arts) {
        const url = `${SITE}/read/${a.id}/`, desc = clip(a.abstract) || `${a.title}. ${NAME}.`, authors = a.authors || [];
        const ld = { "@context": "https://schema.org", "@type": a.type === "Thesis" ? "Thesis" : "ScholarlyArticle", headline: a.title, name: a.title, description: desc, url, inLanguage: "en",
          author: authors.map((n) => ({ "@type": "Person", name: n })), datePublished: String(a.year), sameAs: a.url, isPartOf: { "@type": "Collection", name: a.collection || "UPOU Repository" } };
        const page = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${csp}
${head(`${a.title} | UPOU Repository`, desc, url)}
${m("citation_title", a.title)}
${authors.map((n) => m("citation_author", n)).join("\n")}
${m("citation_publication_date", a.year)}
${a.type === "Thesis" ? m("citation_dissertation_institution", "University of the Philippines Open University") : ""}
${a.doi ? m("citation_doi", a.doi) : ""}
${m("citation_abstract_html_url", url)}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head><body>
<main><article><h1>${esc(a.title)}</h1>
<p>${esc(authors.join("; "))}</p>
<p>${esc(a.type)} · ${esc(a.collection || "")} · ${esc(a.year)}</p>
<h2>Abstract</h2><p>${esc(a.abstract || "No abstract available.")}</p>
<p><a href="../../#/read/${esc(a.id)}">Open in the reader</a> · <a href="${esc(a.url)}">Open in the UPOU Repository</a></p>
</article></main>
<script src="../../r.js" data-id="${esc(a.id)}"></script>
</body></html>`;
        mkdirSync(join(dist, "read", String(a.id)), { recursive: true });
        writeFileSync(join(dist, "read", String(a.id), "index.html"), page);
        urls.push(url);
      }
      writeFileSync(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
      writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
      // R298: RFC 9116 placeholder written per build so Expires stays under a year out; the operator sets the real Contact before launch (no address here)
      mkdirSync(join(dist, ".well-known"), { recursive: true });
      writeFileSync(join(dist, ".well-known/security.txt"), `# Placeholder: replace the Contact line with the UPOU deployment's security contact before launch.\nContact: [operator security contact, to be set]\nExpires: ${new Date(Date.now() + 300 * 864e5).toISOString()}\nPreferred-Languages: en\nCanonical: ${SITE}/.well-known/security.txt\n`);
      writeFileSync(join(dist, "404.html"), `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | UPOU Repository</title></head><body><main><h1>Page not found</h1><p><a href="${SITE}/">Go to the UPOU Repository concept home page</a></p></main></body></html>\n`);
    },
  };
}
