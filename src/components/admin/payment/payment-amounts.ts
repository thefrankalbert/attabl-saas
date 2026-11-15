/**
 * Pure amount rules of the payment screen, in MAJOR units of the currency.
 * Isolated to be tested: this is money handed back to a customer.
 */

/** Same ceiling as the server (order.schema MAX_TIP_AMOUNT). */
const MAX_TIP = 1_000_000;

/** FCFA has no cents: amounts are whole numbers. */
function isZeroDecimal(currency: string): boolean {
  return currency === 'XOF' || currency === 'XAF';
}

/**
 * Custom tip typed by the cashier, made safe: a negative tip lowered the amount
 * to collect (cash validated with less money, then refused by the server after
 * the change was handed back), and decimals have no meaning in FCFA.
 */
export function parseTip(raw: string, currency: string): number {
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const decimals = isZeroDecimal(currency) ? 0 : 2;
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  return Math.min(rounded, MAX_TIP);
}

/** Tip shortcuts sized to the currency (1 000 FCFA, but not 1 000 EUR). */
export function tipPresets(currency: string): readonly number[] {
  return isZeroDecimal(currency) ? [1000, 2000, 5000] : [1, 2, 5];
}

/** "+N" shortcuts for the cash received, sized to the currency. */
export function cashQuickAdd(currency: string): readonly number[] {
  return isZeroDecimal(currency) ? [1000, 2000, 5000, 10000] : [5, 10, 20, 50];
}

/** Longest amount the keypad accepts (999 999 999): beyond, parseFloat goes exponential. */
export const MAX_KEYPAD_DIGITS = 9;
