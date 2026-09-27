const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const signedUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", signDisplay: "exceptZero" });
const pct = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const qty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

/** Format a dollar amount as en-US USD, e.g. "$10,000.00". */
export function formatPrice(v: number): string {
  return usd.format(v);
}

/** Format a dollar amount with sign except zero, e.g. "+$12.34", "$0.00". */
export function formatSignedPrice(v: number): string {
  return signedUsd.format(v);
}

/** Format a percent with sign and 2 decimals, e.g. "+1.25%". */
export function formatPercent(v: number): string {
  return `${pct.format(v)}%`;
}

/** Format a share quantity with up to 4 decimals, e.g. "5", "2.5". */
export function formatQty(v: number): string {
  return qty.format(v);
}
