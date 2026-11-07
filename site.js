"use strict";
document.documentElement.classList.add("js");
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
    document.querySelector("#summary-method").textContent = crypto
      ? currencies[donationForm.elements.namedItem("crypto").value]
      : (donationForm.elements.namedItem("method").value === "card" ? "Card (planned)" : "Bank (planned)");
    document.querySelector("#summary-detail").textContent = crypto
      ? "Send any quantity you choose in your wallet. The euro amount is a guide, not a quote. No automatic conversion or charge."
      : "This payment method is not available yet. Nothing will be charged.";
    checkButton.textContent = crypto ? "View donation address" : "Check availability";
    checkButton.disabled = false;
    status.textContent = "";
    document.querySelector("#sol-copy-status").textContent = "";
  };
  donationForm.addEventListener("change", renderDonation);
  customAmount.addEventListener("input", renderDonation);
  donationForm.addEventListener("submit", event => {
    event.preventDefault();
    if (donationForm.elements.namedItem("method").value === "crypto") {
      document.querySelector("#sol-address").scrollIntoView({ block: "center" });
      status.textContent = "Send SOL, USDC or EURC on Solana to the address shown. Choose the quantity in your wallet; this page does not submit a transfer.";
    } else {
      status.textContent = "This payment option is not available yet. Nothing was submitted or charged.";
    }
  });
  renderDonation();
}
const preview = document.querySelector("#plan-preview");
if (preview) {
  const plans = {
    monthly: { name: "Monthly", price: "€8 / month", detail: "€8 per month. Billing is not connected." },
    annual: { name: "Annual", price: "€48 / year", detail: "€48 per year, equivalent to €4 per month. Saves 50% versus 12 monthly payments." }
  };
  const methods = { card: "Card (planned)", bank: "Bank (planned)", crypto: "Crypto (planned)" };
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
          detail: "One-time prepaid access. No automatic renewal. Payments are not connected." }
      : plans[data.get("plan")];
    document.querySelector("#summary-plan").textContent = plan.name;
    document.querySelector("#summary-price").textContent = plan.price;
    document.querySelector("#summary-detail").textContent = plan.detail;
    document.querySelector("#summary-method").textContent = cryptoSelected
      ? `${cryptocurrencies[data.get("crypto")]} (planned)`
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
      "Payments are not available. Nothing was submitted, charged or activated.";
  });
  render();
  if (recipient) renderRecipient();
}
