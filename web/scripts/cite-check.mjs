// Citation styles vs hand-checked samples: node scripts/cite-check.mjs  -> "N checks, M FAIL", exit 1 on FAIL.
import { styleText, bibtex, ris, csv } from "../src/cite.js";
const A = (authors) => ({ id: "7", authors, title: "Learning online: a study", year: 2020, type: "Article", doi: "", url: "https://repository.upou.edu.ph/handle/1/7" });
const U = "https://repository.upou.edu.ph/handle/1/7";
const cases = [
  ["apa 1", styleText(A(["Cruz, Ana Maria"]), "apa"), `Cruz, A. M. (2020). Learning online: a study. UPOU Repository. ${U}`],
  ["apa 3", styleText(A(["Cruz, Ana", "Reyes, Ben", "Lim, Cy"]), "apa"), `Cruz, A., Reyes, B., & Lim, C. (2020). Learning online: a study. UPOU Repository. ${U}`],
  ["mla 2", styleText(A(["Cruz, Ana Maria", "Reyes, Ben"]), "mla"), `Cruz, Ana Maria, and Ben Reyes. “Learning online: a study.” UPOU Repository, 2020, ${U}.`],
  ["mla 3+", styleText(A(["Cruz, Ana", "Reyes, Ben", "Lim, Cy"]), "mla"), `Cruz, Ana, et al. “Learning online: a study.” UPOU Repository, 2020, ${U}.`],
  ["chicago 3", styleText(A(["Cruz, Ana", "Reyes, Ben", "Lim, Cy"]), "chicago"), `Cruz, Ana, Ben Reyes, and Cy Lim. 2020. “Learning online: a study.” Article. UPOU Repository. ${U}.`],
  ["bibtex", bibtex([A(["Cruz, Ana"])]).includes("author = {Cruz, Ana}") && bibtex([A(["Cruz, Ana"])]).includes("@misc{upou7,"), true],
  ["ris", ris([A(["Cruz, Ana"])]).startsWith("TY  - JOUR\r\nAU  - Cruz, Ana\r\n"), true],
  // whole-result export: CSV quotes every field, id = handle (also in the url column), formula cells are defused; RIS/BibTeX carry the abstract
  ["csv", csv([{ ...A(["Cruz, Ana", "Lim, Cy"]), title: '=HYPERLINK("x") "q"', abstract: "Line one\nline two", subjects: ["a", "b"], collection: "C" }]).split("\r\n")[1], `"1/7","${U}","'=HYPERLINK(""x"") ""q""","Cruz, Ana; Lim, Cy","2020","Article","C","","a; b","Line one line two"`],
  ["ris abstract", ris([{ ...A(["Cruz, Ana"]), abstract: "A\nB" }]).includes("\r\nAB  - A B\r\nUR  - "), true],
  ["bibtex abstract", bibtex([{ ...A(["Cruz, Ana"]), abstract: "A {B}" }]).includes("abstract = {A B},"), true],
  ["no abstract, no AB line", !ris([A(["Cruz, Ana"])]).includes("AB  - ") && !bibtex([A(["Cruz, Ana"])]).includes("abstract"), true],
];
const T = { ...A(["Cruz, Ana"]), type: "Thesis", doi: "10.1/x" };
cases.push(["apa thesis", styleText(T, "apa"), "Cruz, A. (2020). Learning online: a study [Thesis, University of the Philippines Open University]. UPOU Repository. https://doi.org/10.1/x"]);
cases.push(["mla doi", styleText(T, "mla"), "Cruz, Ana. “Learning online: a study.” UPOU Repository, 2020, https://doi.org/10.1/x."]);
cases.push(["chicago doi", styleText(T, "chicago"), "Cruz, Ana. 2020. “Learning online: a study.” Thesis. UPOU Repository. https://doi.org/10.1/x."]);
cases.push(["doi with space and brackets is encoded", styleText({ ...T, doi: "10.1/a b[1]" }, "mla").includes("https://doi.org/10.1/a%20b%5B1%5D"), true]);
cases.push(["apa no year", styleText({ ...A(["Cruz, Ana"]), year: "" }, "apa"), `Cruz, A. (n.d.). Learning online: a study. UPOU Repository. ${U}`]);
cases.push(["mla no year, 1 author no et al", styleText({ ...A(["Cruz, Ana"]), year: null }, "mla"), `Cruz, Ana. “Learning online: a study.” UPOU Repository, n.d., ${U}.`]);
import fs from "node:fs"; const ALL = JSON.parse(fs.readFileSync(new URL("../public/index/articles.json", import.meta.url)));
for (const s of ["apa", "mla", "chicago"]) cases.push([`all ${ALL.length} items cite (${s}) with no undefined/NaN, year and a link`, ALL.filter((a) => { const t = styleText({ ...a, type: a.type }, s); return /undefined|NaN|\[object/.test(t) || !t.includes(String(a.year)) || !/https:\/\//.test(t); }).length, 0]);
let bad = 0;
for (const [n, got, want] of cases) if (got !== want) { bad++; console.log(`FAIL ${n}\n  got  ${got}\n  want ${want}`); }
console.log(`${cases.length} checks, ${bad} FAIL`); process.exit(bad ? 1 : 0);
