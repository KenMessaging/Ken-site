"use strict";
document.documentElement.classList.add("js");
const themeControls = document.querySelectorAll("[data-theme-choice]");
let storedTheme = null;
try {
  storedTheme = localStorage.getItem("ken-theme");
} catch (error) {
  console.warn("Theme preference is unavailable:", error);
}
const setTheme = (choice) => {
  if (choice === "light" || choice === "dark") document.documentElement.dataset.theme = choice;
  else delete document.documentElement.dataset.theme;
  themeControls.forEach(control => { control.value = choice; });
};
setTheme(storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system");
themeControls.forEach(control => control.addEventListener("change", () => {
  setTheme(control.value);
  try {
    if (control.value === "system") localStorage.removeItem("ken-theme");
    else localStorage.setItem("ken-theme", control.value);
  } catch (error) {
    console.warn("Theme preference could not be saved:", error);
  }
}));
const menu = document.querySelector(".menu-button");
const links = document.querySelector("#nav-links");
if (menu && links) {
  menu.addEventListener("click", () => {
    const expanded = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(expanded));
    links.classList.toggle("is-open", expanded);
  });
  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      menu.setAttribute("aria-expanded", "false");
      links.classList.remove("is-open");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
      menu.setAttribute("aria-expanded", "false");
      links.classList.remove("is-open");
      menu.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !links.contains(event.target)) {
      menu.setAttribute("aria-expanded", "false");
      links.classList.remove("is-open");
    }
  });
}
const copySolAddress = document.querySelector("#copy-sol-address");
if (copySolAddress) {
  copySolAddress.hidden = false;
  copySolAddress.addEventListener("click", async () => {
    const address = document.querySelector("#sol-address").textContent.trim();
    const status = document.querySelector("#sol-copy-status");
    try {
      await navigator.clipboard.writeText(address);
      status.textContent = "Wallet address copied. Send SOL, USDC or EURC on the Solana network only.";
    } catch {
      status.textContent = "Could not copy the address. Select and copy the wallet address above manually.";
    }
  });
}
const donationForm = document.querySelector("#donation-preview");
if (donationForm) {
  const donationName = document.querySelector("#donation-name");
  const donationMemo = document.querySelector("#donation-memo");
  const memoStatus = document.querySelector("#donation-memo-status");
  const copyMemo = document.querySelector("#copy-donation-memo");
  const renderMemo = () => {
    const name = donationName.value.trim();
    const valid = [...name].length <= 40 && !/[\p{Cc}\p{Cf}]/u.test(name);
    donationName.setCustomValidity(valid ? "" : "Use up to 40 visible characters.");
    donationMemo.textContent = valid && name ? `Ken donation: ${name}` : "Ken donation";
    copyMemo.disabled = !valid;
    memoStatus.textContent = valid ? "" : "Use up to 40 visible characters, without control characters.";
  };
  donationName.addEventListener("input", renderMemo);
  copyMemo.hidden = false;
  copyMemo.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(donationMemo.textContent);
      memoStatus.textContent = "Memo copied. Paste it into your wallet's transaction memo before sending.";
    } catch {
      memoStatus.textContent = "Could not copy the memo. Select and copy the text above manually.";
    }
  });
  renderMemo();
  const customAmount = document.querySelector("#custom-amount");
  const cryptoOptions = document.querySelector("#crypto-options");
  const checkButton = document.querySelector("#donation-check");
  const status = document.querySelector("#preview-status");
  const currencies = {
    "solana-sol": "SOL on Solana",
    "solana-usdc": "USDC on Solana",
    "solana-eurc": "EURC on Solana"
  };
  const renderDonation = () => {
    const custom = donationForm.elements.namedItem("amount").value === "custom";
    customAmount.disabled = !custom;
    document.querySelector("#custom-amount-field").hidden = !custom;
    const crypto = donationForm.elements.namedItem("method").value === "crypto";
    cryptoOptions.hidden = !crypto;
    cryptoOptions.disabled = !crypto;
    const amount = custom
      ? (customAmount.value && customAmount.validity.valid ? Number(customAmount.value) : null)
      : Number(donationForm.elements.namedItem("amount").value);
    document.querySelector("#summary-price").textContent = amount === null
      ? "Choose an amount"
      : `${new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(amount)} once`;
    document.querySelector("#summary-method").textContent = currencies[donationForm.elements.namedItem("crypto").value];
    document.querySelector("#summary-detail").textContent = "Send any quantity you choose in your wallet. The euro amount is a guide, not a quote. No automatic conversion or charge.";
    checkButton.textContent = "View donation address";
    checkButton.disabled = false;
    status.textContent = "";
    document.querySelector("#sol-copy-status").textContent = "";
  };
  donationForm.addEventListener("change", renderDonation);
  customAmount.addEventListener("input", renderDonation);
  donationForm.addEventListener("submit", event => {
    event.preventDefault();
    document.querySelector("#sol-address").scrollIntoView({ block: "center" });
    status.textContent = "Send SOL, USDC or EURC on Solana to the address shown. Choose the quantity in your wallet; this page does not submit a transfer.";
  });
  renderDonation();
}
const activity = document.querySelector("#donation-activity");
if (activity) {
  const status = document.querySelector("#donation-activity-status");
  const recent = document.querySelector("#recent-donations");
  const top = document.querySelector("#top-donors");
  const euro = value => new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(value / 1e6);
  const validDonor = donor => typeof donor.sender === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(donor.sender) &&
    (donor.name === null || (typeof donor.name === "string" && [...donor.name].length <= 40)) &&
    (donor.eur_micros === null || (Number.isSafeInteger(donor.eur_micros) && donor.eur_micros >= 0));
  const render = (list, donors, latest) => {
    list.replaceChildren();
    for (const donor of donors) {
      const item = document.createElement("li");
      const identity = document.createElement("strong");
      identity.textContent = donor.name || donor.sender;
      const value = document.createElement("span");
      value.textContent = latest
        ? `${donor.amount.toLocaleString("en", { maximumFractionDigits: 9 })} ${donor.symbol} · ${donor.eur_micros === null ? "EUR estimate pending" : `≈ ${euro(donor.eur_micros)}`}`
        : `≈ ${euro(donor.eur_micros)}`;
      const link = document.createElement("a");
      link.href = `https://explorer.solana.com/${latest ? "tx" : "address"}/${encodeURIComponent(latest ? donor.signature : donor.sender)}`;
      link.textContent = latest ? `View transfer · ${new Date(donor.timestamp * 1000).toLocaleString()}` : "View sending address";
      link.rel = "noreferrer";
      item.append(identity, value, link);
      list.append(item);
    }
  };
  let loading = false;
  const loadActivity = async () => {
    if (loading || document.hidden) return;
    loading = true;
    try {
      const response = await fetch(activity.dataset.endpoint, { credentials: "omit", referrerPolicy: "no-referrer",
        cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Donation service unavailable");
      const data = await response.json();
      if (!Array.isArray(data.recent) || data.recent.length > 10 || !Array.isArray(data.top) || data.top.length > 3 ||
          typeof data.complete !== "boolean" || !Number.isSafeInteger(data.pendingPrices) || data.pendingPrices < 0 ||
          (data.updatedAt !== null && (!Number.isSafeInteger(data.updatedAt) || data.updatedAt <= 0)) ||
          (data.error !== null && typeof data.error !== "string") ||
          !data.recent.every(donor => validDonor(donor) && ["SOL", "USDC", "EURC"].includes(donor.symbol) &&
            Number.isFinite(donor.amount) && donor.amount > 0 && Number.isSafeInteger(donor.timestamp) &&
            donor.timestamp > 0 && /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(donor.signature)) ||
          !data.top.every(donor => validDonor(donor) && donor.eur_micros !== null)) {
        throw new Error("Invalid donation summary");
      }
      render(recent, data.recent, true);
      render(top, data.complete ? data.top : [], false);
      const stale = data.updatedAt === null || Date.now() - data.updatedAt * 1000 > 15 * 60000 ||
        data.updatedAt * 1000 - Date.now() > 60000;
      const updated = data.updatedAt ? ` Last indexed ${new Date(data.updatedAt * 1000).toLocaleString()}.` : "";
      status.textContent = data.error || stale
        ? `Donation activity is delayed or not yet available.${updated} Please check again later.`
        : !data.complete
          ? `History or EUR pricing is still loading. The all-time ranking will appear when complete.${updated}`
          : data.recent.length === 0
            ? `No supported direct donations found yet.${updated}`
            : `Showing the latest indexed donations.${updated}`;
    } catch (error) {
      console.warn("Could not load public donation activity:", error);
      status.textContent = "Could not refresh donation activity. Any entries shown are from the last successful refresh. Please try again later.";
    } finally { loading = false; }
  };
  loadActivity();
  setInterval(loadActivity, 60000);
  document.addEventListener("visibilitychange", loadActivity);
}
const preview = document.querySelector("#plan-preview");
if (preview) {
  const plans = {
    monthly: { name: "Monthly", price: "€8 / month", detail: "€8 per month." },
    annual: { name: "Annual", price: "€48 / year", detail: "€48 per year, equivalent to €4 per month. Saves 50% versus 12 monthly payments." }
  };
  const methods = { card: "Card (preview)", bank: "Bank (preview)", crypto: "Crypto (preview)" };
  const cryptocurrencies = {
    "solana-usdc": "USDC on Solana",
    "solana-eurc": "EURC on Solana",
    "ethereum-usdc": "USDC on Ethereum",
    monero: "Monero (XMR)",
    bitcoin: "Bitcoin (BTC)"
  };
  const cryptoOptions = document.querySelector("#crypto-options");
  const cryptoDuration = document.querySelector("#crypto-duration");
  const subscriptionPlans = document.querySelector("#subscription-plans");
  const months = document.querySelector("#prepaid-months");
  const recipient = document.querySelector("#recipient-username");
  const estimateCard = document.querySelector("#crypto-estimate");
  const estimateAmount = document.querySelector("#estimate-amount");
  const estimateRate = document.querySelector("#estimate-rate");
  const estimateTimer = document.querySelector("#estimate-timer");
  const estimateStatus = document.querySelector("#estimate-status");
  const refreshEstimate = document.querySelector("#refresh-estimate");
  const coins = {
    "solana-usdc": { id: "usd-coin", symbol: "USDC", digits: 6 },
    "solana-eurc": { id: "euro-coin", symbol: "EURC", digits: 6 },
    "ethereum-usdc": { id: "usd-coin", symbol: "USDC", digits: 6 },
    monero: { id: "monero", symbol: "XMR", digits: 12 },
    bitcoin: { id: "bitcoin", symbol: "BTC", digits: 8 }
  };
  let estimate = null;
  let estimateKey = "";
  let estimateRequest = null;
  let estimateInterval = null;
  const clearEstimate = () => {
    estimateRequest?.abort();
    estimateRequest = null;
    clearInterval(estimateInterval);
    estimateInterval = null;
    estimate = null;
    estimateAmount.textContent = "No estimate yet.";
    estimateRate.textContent = "";
    estimateTimer.textContent = "";
    estimateStatus.textContent = "";
    refreshEstimate.disabled = false;
  };
  const updateTimer = () => {
    if (!estimate) return;
    // Both clocks must remain within the window, including after device sleep.
    const remaining = Math.min(estimate.until - Date.now(),
      estimate.duration - (performance.now() - estimate.started));
    if (remaining <= 0) {
      clearEstimate();
      estimateAmount.textContent = "Estimate expired.";
      estimateStatus.textContent = "Get a new estimate to see the current rate.";
      return;
    }
    const seconds = Math.ceil(remaining / 1000);
    estimateTimer.textContent = `Frozen estimate expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const loadEstimate = async () => {
    clearEstimate();
    if (preview.elements.namedItem("method").value !== "crypto") return;
    const key = estimateKey;
    const currency = preview.elements.namedItem("crypto").value;
    const coin = coins[currency];
    const euros = prepaidPrice(Number(months.value));
    const controller = new AbortController();
    estimateRequest = controller;
    refreshEstimate.disabled = true;
    estimateStatus.textContent = "Loading the current EUR market rate…";
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=eur&include_last_updated_at=true`,
        { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" }
      );
      if (!response.ok) throw new Error("Rate provider unavailable");
      const rates = await response.json();
      const rate = rates[coin.id]?.eur;
      const timestamp = rates[coin.id]?.last_updated_at;
      const age = Date.now() - timestamp * 1000;
      const units = Math.ceil((euros / rate) * 10 ** coin.digits);
      if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(timestamp) ||
          !Number.isSafeInteger(units) || units <= 0 ||
          age > 5 * 60000 || age < -60000) throw new Error("Rate missing or stale");
      if (estimateRequest !== controller || key !== estimateKey) return;
      const duration = 8 * 60000;
      estimate = { until: Date.now() + duration, started: performance.now(), duration };
      const quantity = (units / 10 ** coin.digits)
        .toLocaleString("en", { maximumFractionDigits: coin.digits });
      estimateAmount.textContent = `≈ ${quantity} ${coin.symbol} for ${formatEuro(euros)}`;
      estimateRate.textContent = `${cryptocurrencies[currency]} · 1 ${coin.symbol} ≈ €${rate.toLocaleString("en", { maximumFractionDigits: 6 })}. Source updated ${new Date(timestamp * 1000).toLocaleTimeString()}.`;
      estimateStatus.textContent = "Preview estimate only. Not a guaranteed payment quote.";
      updateTimer();
      estimateInterval = setInterval(updateTimer, 1000);
    } catch {
      if (estimateRequest !== controller || key !== estimateKey) return;
      estimateAmount.textContent = "Live estimate unavailable.";
      estimateStatus.textContent = "The rate service could not be reached or returned an outdated rate. Please try again; no payment was created.";
    } finally {
      clearTimeout(timeout);
      if (estimateRequest === controller) {
        estimateRequest = null;
        refreshEstimate.disabled = false;
        refreshEstimate.textContent = "Refresh live estimate";
      }
    }
  };
  refreshEstimate.addEventListener("click", loadEstimate);
  document.addEventListener("visibilitychange", updateTimer);
  const formatEuro = value => new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(value);
  const prepaidPrice = count => Math.floor(count / 12) * 48 + (count % 12) * 8;
  if (months) {
    for (let count = 1; count <= 24; count++) {
      months.add(new Option(`${count} ${count === 1 ? "month" : "months"} — €${prepaidPrice(count)}`, String(count)));
    }
  }
  const renderRecipient = () => {
    document.querySelector("#summary-recipient").textContent = recipient.validity.valid && recipient.value.trim()
      ? recipient.value.trim() : "Choose a recipient";
  };
  if (recipient) recipient.addEventListener("input", renderRecipient);
  const render = () => {
    const cryptoSelected = preview.elements.namedItem("method").value === "crypto";
    cryptoOptions.hidden = !cryptoSelected;
    cryptoOptions.disabled = !cryptoSelected;
    cryptoDuration.hidden = !cryptoSelected;
    cryptoDuration.disabled = !cryptoSelected;
    subscriptionPlans.hidden = cryptoSelected;
    subscriptionPlans.disabled = cryptoSelected;
    const data = new FormData(preview);
    const count = months ? Number(months.value) : null;
    const plan = cryptoSelected
      ? { name: `${count} prepaid ${count === 1 ? "month" : "months"}`, price: `€${prepaidPrice(count)} once`,
          detail: "One-time prepaid access. No automatic renewal." }
      : plans[data.get("plan")];
    document.querySelector("#summary-plan").textContent = plan.name;
    document.querySelector("#summary-price").textContent = plan.price;
    document.querySelector("#summary-detail").textContent = plan.detail;
    document.querySelector("#summary-method").textContent = cryptoSelected
      ? `${cryptocurrencies[data.get("crypto")]} (preview)`
      : methods[data.get("method")];
    document.querySelector("#preview-status").textContent = "";
    estimateCard.hidden = !cryptoSelected;
    const key = cryptoSelected ? `${data.get("crypto")}:${count}` : "";
    if (key !== estimateKey) {
      estimateKey = key;
      clearEstimate();
      if (cryptoSelected) void loadEstimate();
    }
  };
  preview.addEventListener("change", render);
  preview.addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelector("#preview-status").textContent =
      "This is a plan preview. Nothing was submitted, charged or activated.";
  });
  render();
  if (recipient) renderRecipient();
}
