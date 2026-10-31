# Faculty folder

One JSON file per person. **What you type here is shown to anyone who signs in to the Advisers pages** (the build merges it into the encrypted adviser data; the files themselves are git-ignored, except this README and the example, and are sealed into `web/sealed`). Do not put emails, phone numbers, addresses or any private data here; the build refuses files that contain them. Facts typed in here are shown as "added manually". Files with `"example": true` are documentation only and are left out of the site.

A person's file **extends and overrides** what the site derives from the theses (advisers) and articles (authors). It is also the place to **correct a name**: a surname change, a new title, a spelling variant, or a wrong automatic merge. The folder wins over `adviser-aliases.json` and over the automatic merge by surname and first name.

`ijodel-articles.json` (a snapshot of the article list of the IJODeL journal, used for the "From IJODeL" links) lives here too and is not a person file.

The "Springer publications" list on a profile (and the "Also published by Springer" line on a repository item) comes from an automatic Crossref match, so it is only a sample and can miss or mistake a person. Faculty-submitted lists are meant to replace it.

## Fields

| field | required | meaning |
|---|---|---|
| `slug` | yes | lowercase letters and hyphens, unique. The profile is `#/adviser/<slug>` |
| `canonical_slug` | no | a stable slug to keep if `slug` ever changes |
| `name` | yes | "Given Surname", without title. This is the matching key (surname + first name) |
| `display_name` | no | what the site shows if different from `name` |
| `title` | no | "Dr.", "Prof.", "Assoc. Prof.", "Asst. Prof.", "Engr.", "Atty.", "Mr.", "Ms.", "Mrs." or free text up to 30 characters. Shown before the name, never used in matching or search |
| `former_names` | no | old or maiden names, e.g. `["Maria Santos"]` |
| `aliases` | no | other spellings, nicknames, OCR variants |
| `not_same_as` | no | names that an automatic merge wrongly joined with this person; they are split off into their own entry |
| `corrections` | no | free text shown on the profile as "Name history" (for example "Surname changed 2023") |
| `status` | no | `active` (default), `new` (badge "New faculty, no advised theses yet": can be on a panel through its expertise text, not chair by default), `former` (badge "No longer connected to the university": left out of suggested panels unless "include former" is ticked), `external` |
| `since`, `until` | no | years |
| `unit` | no | department or unit |
| `expertise` | no | free-text topics (matched by words, and by meaning if the visitor opted in) |
| `expertise_topics` | no | `{ "k": "category"\|"subtopic"\|"tag", "v": "<existing label>" }` |
| `works` | no | own works: `{ "title": "...", "id": "<repository item id>" }` (id optional) |
| `ijodel_authors` | no | author strings of IJODeL articles to attach for sure, e.g. `["Santos-Reyes, Maria"]` (also overrides an "ambiguous" non-match) |
| `ijodel_exclude` | no | IJODeL article ids that are NOT this person |
| `international`, `not_international` | no | repository item ids (or `ij:<id>` for an IJODeL article) to count, or not count, as international publications |
| `writeups` | no | `half`, `one`, `two`, each `{ "text", "source": "ai"\|"human", "reviewed": true\|false, "note" }`. AI text is labelled AI on the page |
| `notes` | no | free text, shown as added manually |

All names (`name`, `display_name`, `former_names`, `aliases`) are merged into one person at build time, for the advisers and authors found in the theses and for IJODeL authors. Old profile addresses (`#/adviser/<old-slug>`) redirect to the current one. A name may belong to one person only; the check `node scripts/faculty_check.mjs` fails with both file names otherwise.

## Worked example: surname change and new title

Maria Santos advised theses until 2022, married, and is now Dr. Maria Santos-Reyes. `example-surname-and-title-change.json` (marked `"example": true`; remove that line for a real file) has `name` "Maria Santos-Reyes", `title` "Dr.", `former_names` ["Maria Santos"] and a `corrections` line. Result: the theses advised as "Maria Santos" and the articles by "Santos, Maria" join the page of "Dr. Maria Santos-Reyes"; the old address redirects; "Dr." is displayed but search and matching use only "Maria" + "Santos-Reyes".

## Build

`cd web && npm run build` runs `scripts/people-merge.mjs` first (merges this folder into `public/index/people.json`; stops with a clear message on a schema error). Check only: `node scripts/faculty_check.mjs`.

## Other

Article links labelled "From IJODeL" point to the journal's own pages (ijodel.upou.edu.ph) only.
