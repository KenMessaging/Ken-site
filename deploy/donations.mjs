export const wallet = "3RKLeCUEsNkCR3kb5jEFCUy4ccQqXj7axXN7xkZRPPZ6";
export const assets = {
  SOL: { coin: "solana", decimals: 9 },
  USDC: { coin: "usd-coin", decimals: 6, mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  EURC: { coin: "euro-coin", decimals: 6, mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr" }
};
const memoPrograms = new Set(["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"]);
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function decodeMemo(instruction) {
  if (!memoPrograms.has(instruction.programId) || typeof instruction.data !== "string" ||
      instruction.data.length > 512) return null;
  let number = 0n;
  for (const character of instruction.data) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return null;
    number = number * 58n + BigInt(digit);
  }
  const bytes = [];
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  for (const character of instruction.data) {
    if (character !== "1") break;
    bytes.unshift(0);
  }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes)); }
  catch { return null; }
  if (!text.startsWith("Ken donation: ")) return null;
  const name = text.slice(14).trim();
  return validName(name) ? name : null;
}

function base58Length(text) {
  let number = 0n;
  for (const character of text) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return -1;
    number = number * 58n + BigInt(digit);
  }
  let length = 0;
  while (number > 0n) { length++; number >>= 8n; }
  for (const character of text) { if (character !== "1") break; length++; }
  return length;
}

export function validName(name) {
  return typeof name === "string" && name.length > 0 && [...name].length <= 40 && !/[\p{Cc}\p{Cf}]/u.test(name);
}

export function parseClaim(body) {
  if (!body || typeof body !== "object") return null;
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) || base58Length(address) !== 32 || address === wallet ||
      !validName(name)) return null;
  return { address, name };
}

export function donationsFrom(transaction) {
  if (!transaction || !Array.isArray(transaction.nativeTransfers) || !Array.isArray(transaction.tokenTransfers) ||
      !Array.isArray(transaction.instructions) || !Number.isSafeInteger(transaction.timestamp) ||
      transaction.timestamp <= 0 || !/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(transaction.signature)) {
    throw new Error("Invalid blockchain provider response.");
  }
  if (transaction.transactionError || transaction.type !== "TRANSFER") return [];
  const incoming = [];
  const append = (sender, symbol, amount, index) => {
    if (typeof sender !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(sender)) {
      throw new Error("Invalid donation sender.");
    }
    if (sender === wallet) return;
    if (amount === 0) return;
    if (!Number.isFinite(amount) || amount < 0 ||
        !Number.isSafeInteger(Math.round(amount * 10 ** assets[symbol].decimals))) {
      throw new Error("Invalid donation amount.");
    }
    incoming.push({ signature: transaction.signature, index, sender, symbol, amount,
      timestamp: transaction.timestamp, rateHour: new Date(transaction.timestamp * 1000).toISOString().slice(0, 13) });
  };
  transaction.nativeTransfers.forEach((transfer, index) => {
    if (transfer.toUserAccount === wallet) append(transfer.fromUserAccount, "SOL", transfer.amount / 1e9, `sol-${index}`);
  });
  transaction.tokenTransfers.forEach((transfer, index) => {
    const symbol = Object.keys(assets).find(symbol => assets[symbol].mint === transfer.mint);
    if (symbol && transfer.toUserAccount === wallet) {
      append(transfer.fromUserAccount, symbol, transfer.tokenAmount, `token-${index}`);
    }
  });
  const instructions = transaction.instructions.flatMap(instruction => [instruction, ...(instruction.innerInstructions ?? [])]);
  const names = instructions.map(decodeMemo).filter(name => name !== null);
  const name = names.length === 1 && new Set(incoming.map(donation => donation.sender)).size === 1 ? names[0] : null;
  return incoming.map(donation => ({ ...donation, name }));
}

async function json(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  // Provider URLs may contain credentials, so never log them or their error bodies.
  if (!response.ok) throw new Error(`Donation provider returned HTTP ${response.status}.`);
  return response.json();
}

export async function sync(env) {
  const now = Math.floor(Date.now() / 1000);
  const lease = crypto.randomUUID();
  const acquired = await env.DB.prepare(
    "UPDATE sync_state SET lease = ?, lease_until = ? WHERE id = 1 AND lease_until < ?"
  ).bind(lease, now + 240, now).run();
  if (acquired.meta.changes !== 1) return;
  try {
    if (!env.HELIUS_API_KEY) throw new Error("The donation blockchain provider is not configured.");
    let state = await env.DB.prepare("SELECT cursor FROM sync_state WHERE id = 1").first();
    for (let page = 0; page < 3; page++) {
      const url = new URL(`https://api.helius.xyz/v0/addresses/${wallet}/transactions`);
      url.search = new URLSearchParams({
        "api-key": env.HELIUS_API_KEY, "token-accounts": "balanceChanged", "sort-order": "asc",
        commitment: "finalized", limit: "100",
        ...(state.cursor ? { "after-signature": state.cursor } : {})
      }).toString();
      const transactions = await json(url);
      if (!Array.isArray(transactions) || transactions.length > 100) throw new Error("Invalid blockchain history.");
      const statements = [];
      for (const transaction of transactions) {
        for (const donation of donationsFrom(transaction)) {
          statements.push(env.DB.prepare(
            "INSERT OR IGNORE INTO donations (signature, transfer_index, sender, name, symbol, amount, timestamp, rate_hour) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(donation.signature, donation.index, donation.sender, donation.name, donation.symbol,
            donation.amount, donation.timestamp, donation.rateHour));
        }
      }
      const last = transactions.at(-1);
      if (last && last.signature === state.cursor) throw new Error("Blockchain history cursor did not advance.");
      statements.push(env.DB.prepare(
        "UPDATE sync_state SET cursor = ?, caught_up = ?, updated_at = ?, error = NULL WHERE id = 1 AND lease = ?"
      ).bind(last?.signature ?? state.cursor, transactions.length < 100 ? 1 : 0, now, lease));
      // D1 batches are atomic: a failed insert must not advance the history cursor.
      await env.DB.batch(statements);
      state = { cursor: last?.signature ?? state.cursor };
      if (transactions.length < 100) break;
    }
    const missing = await env.DB.prepare(
      "SELECT DISTINCT symbol, rate_hour FROM donations WHERE eur_micros IS NULL ORDER BY rate_hour LIMIT 3"
    ).all();
    for (const { symbol, rate_hour: hour } of missing.results) {
      let rate = await env.DB.prepare("SELECT eur FROM rates WHERE symbol = ? AND rate_hour = ?").bind(symbol, hour).first();
      if (!rate) {
        const timestamp = Date.parse(`${hour}:00:00Z`) / 1000;
        const base = env.COINGECKO_PRO_API_KEY ? "https://pro-api.coingecko.com" : "https://api.coingecko.com";
        const data = await json(
          `${base}/api/v3/coins/${assets[symbol].coin}/market_chart/range?vs_currency=eur&from=${timestamp - 3600}&to=${timestamp + 3600}`,
          env.COINGECKO_PRO_API_KEY ? { "x-cg-pro-api-key": env.COINGECKO_PRO_API_KEY } :
            env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": env.COINGECKO_API_KEY } : {});
        const samples = Array.isArray(data.prices) ? data.prices.filter(sample =>
          Array.isArray(sample) && sample.length === 2 && Number.isFinite(sample[0]) &&
          Math.abs(sample[0] / 1000 - timestamp) <= 3600) : [];
        samples.sort((a, b) => Math.abs(a[0] / 1000 - timestamp) - Math.abs(b[0] / 1000 - timestamp));
        const eur = samples[0]?.[1];
        if (typeof eur !== "number" || !Number.isFinite(eur) || eur <= 0 || eur > 1e8) {
          throw new Error("Historical EUR pricing is unavailable.");
        }
        await env.DB.prepare("INSERT OR IGNORE INTO rates (symbol, rate_hour, eur) VALUES (?, ?, ?)").bind(symbol, hour, eur).run();
        rate = { eur };
      }
      await env.DB.prepare(
        "UPDATE donations SET eur_micros = ROUND(amount * ? * 1000000) WHERE symbol = ? AND rate_hour = ? AND eur_micros IS NULL"
      ).bind(rate.eur, symbol, hour).run();
    }
  } catch (error) {
    await env.DB.prepare("UPDATE sync_state SET error = ? WHERE id = 1 AND lease = ?")
      .bind("Donation indexing or pricing is delayed. Please try again later.", lease).run();
    throw error;
  } finally {
    await env.DB.prepare("UPDATE sync_state SET lease_until = 0 WHERE id = 1 AND lease = ?").bind(lease).run();
  }
}

export async function snapshot(db) {
  const [states, pendingRows, recent, totals] = await db.batch([
    db.prepare("SELECT updated_at, caught_up, error FROM sync_state WHERE id = 1"),
    db.prepare("SELECT COUNT(*) AS count FROM donations WHERE eur_micros IS NULL"),
    db.prepare(
      `SELECT d.signature, d.sender, COALESCE(d.name, c.name) AS name, d.symbol, d.amount, d.timestamp, d.eur_micros
       FROM donations d LEFT JOIN claims c ON c.sender = d.sender
       ORDER BY d.timestamp DESC, d.signature DESC, d.transfer_index DESC LIMIT 10`
    ),
    db.prepare(
      `SELECT d.sender, SUM(d.eur_micros) AS eur_micros,
        COALESCE((SELECT n.name FROM donations n WHERE n.sender = d.sender AND n.name IS NOT NULL ORDER BY n.timestamp DESC, n.signature DESC LIMIT 1),
          (SELECT c.name FROM claims c WHERE c.sender = d.sender)) AS name
       FROM donations d GROUP BY d.sender ORDER BY eur_micros DESC, d.sender LIMIT 3`
    )
  ]);
  const state = states.results[0];
  const pending = pendingRows.results[0];
  const complete = state?.caught_up === 1 && pending.count === 0;
  return { updatedAt: state?.updated_at ?? null, complete, error: state?.error ?? null,
    pendingPrices: pending.count, recent: recent.results, top: complete ? totals.results : [] };
}

async function claim(request, env, headers) {
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
  if (env.CLAIM_LIMIT) {
    const { success } = await env.CLAIM_LIMIT.limit({ key: request.headers.get("CF-Connecting-IP") ?? "unknown" });
    if (!success) return reply(429, { error: "Too many attempts. Please try again in a minute." });
  }
  const text = await request.text();
  let body = null;
  try { if (text.length <= 1024) body = JSON.parse(text); } catch {}
  const parsed = parseClaim(body);
  if (!parsed) return reply(400, { error: "Enter a valid Solana address and a name of up to 40 characters." });
  try {
    const result = await env.DB.prepare("INSERT OR IGNORE INTO claims (sender, name, created_at) VALUES (?, ?, ?)")
      .bind(parsed.address, parsed.name, Math.floor(Date.now() / 1000)).run();
    if (result.meta.changes !== 1) return reply(409, { error: "A name is already saved for this address." });
    return reply(201, { saved: true });
  } catch {
    console.error("Could not save a donation name.");
    return reply(503, { error: "Could not save the name. Please try again later." });
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = new Set(["https://kenmessaging.app", "https://news.kenmessaging.app", "https://register.kenmessaging.app"]);
    const headers = { "Content-Type": "application/json", "Cache-Control": "public, max-age=30",
      "X-Content-Type-Options": "nosniff", Vary: "Origin", ...(allowed.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}) };
    if (new URL(request.url).pathname !== "/") return new Response('{"error":"Not found"}', { status: 404, headers });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, HEAD, POST",
        "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
    }
    if (request.method === "POST") return claim(request, env, { ...headers, "Cache-Control": "no-store" });
    if (!["GET", "HEAD"].includes(request.method)) return new Response('{"error":"Method not allowed"}',
      { status: 405, headers: { ...headers, Allow: "GET, HEAD, POST" } });
    try {
      return new Response(request.method === "HEAD" ? null : JSON.stringify(await snapshot(env.DB)), { headers });
    } catch {
      console.error("Could not read the public donation summary.");
      return new Response('{"error":"Donation activity is temporarily unavailable."}', {
        status: 503, headers: { ...headers, "Cache-Control": "no-store" }
      });
    }
  },
  async scheduled(_event, env, context) {
    context.waitUntil(sync(env).catch(() => { console.error("Donation indexing failed; check provider configuration and quotas."); }));
  }
};
