import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import worker, { wallet, assets, decodeMemo, donationsFrom, parseClaim, sync, snapshot } from "./donations.mjs";

globalThis.crypto ??= webcrypto;
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let number = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let result = "";
  while (number > 0n) { result = alphabet[Number(number % 58n)] + result; number /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; result = "1" + result; }
  return result;
}
const sender = "4".repeat(44);
const otherSender = "5".repeat(44);
const memo = name => ({ programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  data: base58(Buffer.from(`Ken donation: ${name}`)) });
const transaction = index => ({
  signature: "3".repeat(75) + base58(Buffer.from([index + 1])),
  timestamp: 1794400000 + index, type: "TRANSFER", transactionError: null,
  instructions: [memo("Supporter")], tokenTransfers: [],
  nativeTransfers: [{ fromUserAccount: sender, toUserAccount: wallet, amount: 1e9 }]
});
assert.equal(decodeMemo(memo("Supporter")), "Supporter");
const claimer = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
assert.deepEqual(parseClaim({ address: ` ${claimer} `, name: " Ada " }), { address: claimer, name: "Ada" });
assert.equal(parseClaim({ address: "z".repeat(44), name: "Ada" }), null, "Addresses must decode to 32 bytes.");
assert.equal(parseClaim({ address: wallet, name: "Ada" }), null);
assert.equal(parseClaim({ address: claimer, name: "" }), null);
assert.equal(parseClaim({ address: claimer, name: "x".repeat(41) }), null);
assert.equal(parseClaim({ address: claimer, name: "a\u202eb" }), null);
assert.equal(decodeMemo(memo("a\nb")), null);
assert.equal(decodeMemo({ ...memo("Fake"), programId: sender }), null);
assert.equal(donationsFrom(transaction(0))[0].amount, 1);
assert.equal(donationsFrom({ ...transaction(0), transactionError: { error: "failed" } }).length, 0);
assert.equal(donationsFrom({ ...transaction(0), type: "SWAP" }).length, 0);
assert.equal(donationsFrom({ ...transaction(0), nativeTransfers: [
  { fromUserAccount: wallet, toUserAccount: wallet, amount: 1e9 }
] }).length, 0);
const tokenTx = { ...transaction(0), nativeTransfers: [], tokenTransfers: [
  { fromUserAccount: sender, toUserAccount: wallet, tokenAmount: 2, mint: assets.USDC.mint },
  { fromUserAccount: sender, toUserAccount: wallet, tokenAmount: 3, mint: assets.EURC.mint },
  { fromUserAccount: sender, toUserAccount: wallet, tokenAmount: 999, mint: "fake" }
] };
assert.deepEqual(donationsFrom(tokenTx).map(d => d.symbol), ["USDC", "EURC"]);
assert.equal(donationsFrom({ ...transaction(0), instructions: [] })[0].name, null);
assert.equal(donationsFrom({ ...transaction(0), nativeTransfers: [
  ...transaction(0).nativeTransfers, { fromUserAccount: otherSender, toUserAccount: wallet, amount: 2e9 }
] })[0].name, null);

// Use real SQLite for D1's SQL semantics, atomic batches and uniqueness constraints.
const directory = await mkdtemp(join(tmpdir(), "ken-donation-test-"));
const database = join(directory, "test.sqlite");
const python = `
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.row_factory = sqlite3.Row
payload = json.load(sys.stdin)
result = []
with db:
 for query in payload:
  if query.get("script"):
   db.executescript(query["script"])
   result.append({})
  else:
   cursor = db.execute(query["sql"], query["params"])
   result.append({"results": [dict(row) for row in cursor.fetchall()], "meta": {"changes": max(cursor.rowcount, 0)}})
print(json.dumps(result))
`;
const execute = queries => {
  const result = spawnSync("python3", ["-c", python, database], { input: JSON.stringify(queries), encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
};
const db = {
  prepare(sql) {
    return {
      sql, params: [],
      bind(...params) { this.params = params; return this; },
      async run() { return execute([this])[0]; },
      async all() { return execute([this])[0]; },
      async first() { return execute([this])[0].results[0] ?? null; }
    };
  },
  async batch(statements) { return execute(statements); }
};
const originalFetch = globalThis.fetch;
try {
  execute([{ script: await readFile(new URL("./donations.sql", import.meta.url), "utf8") }]);
  const firstPage = Array.from({ length: 100 }, (_, index) => transaction(index));
  const finalPage = [transaction(100)];
  let historyRequests = 0;
  let priceRequests = 0;
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    if (parsed.hostname === "api.helius.xyz") {
      assert.equal(parsed.searchParams.get("token-accounts"), "balanceChanged");
      assert.equal(parsed.searchParams.get("commitment"), "finalized");
      assert.equal(parsed.searchParams.get("sort-order"), "asc");
      const after = parsed.searchParams.get("after-signature");
      historyRequests++;
      return Response.json(after === firstPage.at(-1).signature ? finalPage :
        after === finalPage.at(-1).signature ? [] : firstPage);
    }
    priceRequests++;
    const timestamp = Number(parsed.searchParams.get("from")) + 3600;
    return Response.json({ prices: [[timestamp * 1000, 100]] });
  };
  await sync({ DB: db, HELIUS_API_KEY: "test-only" });
  assert.equal(historyRequests, 2, "All history pages are ingested.");
  assert.equal(priceRequests, 1);
  let result = await snapshot(db);
  assert.equal(result.complete, true);
  assert.equal(result.recent.length, 10);
  assert.equal(result.top.length, 1);
  assert.equal(result.top[0].eur_micros, 101 * 100 * 1e6);
  await sync({ DB: db, HELIUS_API_KEY: "test-only" });
  result = await snapshot(db);
  assert.equal(result.top[0].eur_micros, 101 * 100 * 1e6, "Retries cannot double count.");
  for (let index = 0; index < 4; index++) {
    const tx = transaction(101 + index);
    tx.nativeTransfers[0].fromUserAccount = String(index + 6).repeat(44);
    tx.nativeTransfers[0].amount = (index + 2) * 1e9;
    const donation = donationsFrom(tx)[0];
    await db.prepare(
      "INSERT INTO donations (signature, transfer_index, sender, name, symbol, amount, timestamp, rate_hour, eur_micros) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(donation.signature, donation.index, donation.sender, donation.name, donation.symbol,
      donation.amount, donation.timestamp, donation.rateHour, donation.amount * 100 * 1e6).run();
  }
  result = await snapshot(db);
  assert.equal(result.recent.length, 10);
  assert.equal(result.top.length, 3);
  assert.deepEqual(result.top.map(donor => donor.eur_micros), [10100e6, 500e6, 400e6]);
  await db.prepare("UPDATE donations SET eur_micros = NULL WHERE signature = ?").bind(finalPage[0].signature).run();
  result = await snapshot(db);
  assert.equal(result.complete, false);
  assert.equal(result.top.length, 0, "Never label a partial priced history as all-time.");
  const response = await worker.fetch(new Request("https://donations.example/", {
    headers: { Origin: "https://kenmessaging.app" }
  }), { DB: db });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://kenmessaging.app");
  assert.equal((await response.json()).recent.length, 10);
  assert.equal((await worker.fetch(new Request("https://donations.example/", { method: "PUT" }), { DB: db })).status, 405);
  assert.equal((await worker.fetch(new Request("https://donations.example/private"), { DB: db })).status, 404);
  const post = body => worker.fetch(new Request("https://donations.example/", { method: "POST",
    headers: { Origin: "https://kenmessaging.app", "Content-Type": "application/json" }, body }), { DB: db });
  const preflight = await worker.fetch(new Request("https://donations.example/", { method: "OPTIONS",
    headers: { Origin: "https://kenmessaging.app" } }), { DB: db });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Methods"), /POST/);
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post(JSON.stringify({ address: claimer, name: "x".repeat(2000) }))).status, 400);
  const saved = await post(JSON.stringify({ address: claimer, name: "Ada" }));
  assert.equal(saved.status, 201);
  assert.equal(saved.headers.get("Cache-Control"), "no-store");
  assert.equal((await post(JSON.stringify({ address: claimer, name: "Mallory" }))).status, 409, "First claim is final.");
  await db.prepare(
    "INSERT INTO donations (signature, transfer_index, sender, name, symbol, amount, timestamp, rate_hour, eur_micros) VALUES (?, ?, ?, NULL, 'SOL', 1000, 1794500000, '2026-11-12T00', 100000e6)"
  ).bind("9".repeat(88), "sol-0", claimer).run();
  await db.prepare("UPDATE donations SET eur_micros = 1 WHERE eur_micros IS NULL").run();
  result = await snapshot(db);
  assert.equal(result.recent[0].name, "Ada", "Claimed names label later donations.");
  assert.equal(result.top[0].name, "Ada");
  await post(JSON.stringify({ address: "So11111111111111111111111111111111111111112", name: "Claim" }));
  await db.prepare("UPDATE donations SET sender = 'So11111111111111111111111111111111111111112' WHERE sender = ?").bind(sender).run();
  result = await snapshot(db);
  assert.equal(result.recent.find(d => d.sender.startsWith("So1")).name, "Supporter", "Memo names take priority.");
  globalThis.fetch = async () => new Response("provider unavailable", { status: 429 });
  await assert.rejects(sync({ DB: db, HELIUS_API_KEY: "test-only" }), /HTTP 429/);
  assert.ok((await snapshot(db)).error);
  assert.equal((await db.prepare("SELECT lease_until FROM sync_state").first()).lease_until, 0);
  console.log("Donation parsing, name claims, full-history paging, persistence, EUR totals and failure checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}
