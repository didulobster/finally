const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const pct = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

/** Format a dollar amount as en-US USD, e.g. "$10,000.00". */
export function formatPrice(v: number): string {
  return usd.format(v);
}

/** Format a percent with sign and 2 decimals, e.g. "+1.25%". */
export function formatPercent(v: number): string {
  return `${pct.format(v)}%`;
}
