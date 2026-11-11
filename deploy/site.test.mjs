import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const home = await read("index.html");
for (const page of ["index", "features", "news", "register", "ken-plus", "donate", "legal"]) {
  const html = await read(`${page}.html`);
  assert.equal(html.match(/<header\b[\s\S]*?<\/header>/)[0], home.match(/<header\b[\s\S]*?<\/header>/)[0]);
  assert.equal((html.match(/class="announcement"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /class="eyebrow"|class="plus-badge"/);
}
for (const [, location] of (await read("sitemap.xml")).matchAll(/<loc>(.*?)<\/loc>/g)) {
  const url = new URL(location);
  const html = await read(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  assert.ok(html.includes(`<link rel="canonical" href="${url.href}">`));
  assert.doesNotMatch(html, /name="robots" content="noindex"/);
}
console.log("Shared layout and indexable canonical pages verified.");
