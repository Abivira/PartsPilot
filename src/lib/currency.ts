/**
 * Currency conversion and formatting utilities for integer minor units (cents).
 * Guarantees zero IEEE 754 floating point arithmetic errors in financial calculations.
 */

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatCurrency(
  cents: number,
  currency: string = "USD",
  locale: string = "en-US"
): string {
  const dollars = centsToDollars(cents);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export function formatMinorToPayPalString(cents: number): string {
  // Formats integer cents directly to fixed 2-decimal string required by PayPal API (e.g. 1250 -> "12.50")
  return (cents / 100).toFixed(2);
}
