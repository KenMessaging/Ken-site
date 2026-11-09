import assert from "node:assert/strict";
import worker from "./subdomains.mjs";
const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), options });
  return new Response("Ken public page", { headers: { "set-cookie": "must-not-forward" } });
};
for (const [host, path] of [["register", "register"], ["news", "news"]]) {
  const response = await worker.fetch(new Request(`https://${host}.kenmessaging.app/?password=private`,
    { headers: { Authorization: "do-not-forward", Cookie: "do-not-forward" } }));
  assert.equal(response.status, 200);
  assert.equal(requests.at(-1).url, `https://kenmessaging.app/${path}.html`);
  assert.equal(requests.at(-1).options.headers, undefined);
  assert.equal(response.headers.get("set-cookie"), null);
}
assert.equal((await worker.fetch(new Request("https://news.kenmessaging.app/owner-dashboard"))).status, 404);
assert.equal((await worker.fetch(new Request("https://news.kenmessaging.app/", { method: "POST" }))).status, 405);
assert.equal((await worker.fetch(new Request("https://unknown.kenmessaging.app/"))).status, 404);
await worker.fetch(new Request("https://register.kenmessaging.app/site.js?v=20261109"));
assert.equal(requests.at(-1).url, "https://kenmessaging.app/site.js?v=20261109");
console.log("Subdomain routing and credential isolation checks passed.");
