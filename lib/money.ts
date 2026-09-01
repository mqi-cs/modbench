// All money formatting goes through here, per
// specs/04-phase-3-configurator.md. Integer minor units throughout --
// never a float, never a currency-less number.

const SYMBOLS: Record<string, string> = { GBP: "£", SGD: "S$", PHP: "₱", USD: "$", EUR: "€" };

export function formatMinor(minor: number, currency: string): string {
  const symbol = SYMBOLS[currency] ?? "";
  const value = (minor / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}

export function formatGbp(minor: number): string {
  return formatMinor(minor, "GBP");
}

// Global constraint 3 (00-PROJECT.md): "Never render a price without its
// currency and its last-checked timestamp." This renders the native price
// as the vendor charges it, which is what the person is actually billed --
// the GBP figure beside it is ours, converted at ingest.
export function formatNative(priceMinor: number, currency: string): string {
  return formatMinor(priceMinor, currency);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
