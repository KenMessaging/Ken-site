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
  const prepaidPrice = count => Math.floor(count / 12) * 48 + (count % 12) * 8;
  for (let count = 1; count <= 24; count++) {
    months.add(new Option(`${count} ${count === 1 ? "month" : "months"} — €${prepaidPrice(count)}`, String(count)));
  }
  const accountSummary = document.querySelector("#summary-recipient");
  const renderRecipient = () => {
    accountSummary.textContent = recipient.validity.valid && recipient.value.trim()
      ? recipient.value.trim() : "Choose a recipient";
  };
  recipient.addEventListener("input", renderRecipient);
  const render = () => {
    const cryptoSelected = preview.elements.namedItem("method").value === "crypto";
    cryptoOptions.hidden = !cryptoSelected;
    cryptoOptions.disabled = !cryptoSelected;
    cryptoDuration.hidden = !cryptoSelected;
    cryptoDuration.disabled = !cryptoSelected;
    subscriptionPlans.hidden = cryptoSelected;
    subscriptionPlans.disabled = cryptoSelected;
    const data = new FormData(preview);
    const count = Number(months.value);
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
  };
  preview.addEventListener("change", render);
  preview.addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelector("#preview-status").textContent = "Payments are not available. Nothing was submitted, charged or activated.";
  });
  render();
  renderRecipient();
}
