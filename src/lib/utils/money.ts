/**
 * Currency-aware money rounding (audit finding H1 - Phase 2 step 1).
 *
 * Amounts were rounded with a hard-coded toFixed(2) / Math.round(x*100)/100,
 * which is WRONG for the default market: XAF/XOF (CFA franc) are ZERO-DECIMAL
 * currencies - there are no centimes, so a tax/service result like 59.94 must be
 * 60, not 59.94 (an untenderable sub-unit). This rounds to the currency's actual
 * smallest unit using the per-currency `decimals` from CURRENCIES.
 *
 * This is the first step toward integer-minor-unit money; for now it keeps the
 * existing number-based API but rounds correctly per currency.
 */

import { dinero, add, multiply, toSnapshot } from 'dinero.js';
import { XAF, XOF, EUR, USD } from '@dinero.js/currencies';
import type { Currency } from '@dinero.js/currencies';
import { CURRENCIES, type CurrencyCode, DEFAULT_CURRENCY_CODE } from '@/lib/constants';
import { formatCurrency, formatAmount } from './currency';

/** Number of decimal places for a currency (XAF/XOF = 0, EUR/USD = 2). */
export function currencyDecimals(code?: CurrencyCode | string | null): number {
  if (code && code in CURRENCIES) {
    return CURRENCIES[code as CurrencyCode].decimals;
  }
  return CURRENCIES[DEFAULT_CURRENCY_CODE].decimals;
}

/**
 * Round a monetary amount to the currency's smallest tenderable unit.
 * @example roundForCurrency(59.94, 'XAF') // 60
 * @example roundForCurrency(12.345, 'EUR') // 12.35
 */
export function roundForCurrency(amount: number, code?: CurrencyCode | string | null): number {
  const factor = 10 ** currencyDecimals(code);
  // + Number.EPSILON guards against 1.005-style float representation errors.
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

// ─── Integer minor-unit money (audit H1 - Phase 2) ───────────────────────────
//
// Money is stored and transported as integer MINOR UNITS (the currency's
// smallest tenderable unit): XAF/XOF are zero-decimal so the minor unit IS the
// franc (1000 XAF -> 1000); EUR/USD are 2-decimal so 12.50 EUR -> 1250. Integer
// math is exact - no float drift on sums/totals. dinero.js v2 backs the
// arithmetic; the DB columns are BIGINT.

const DINERO_CURRENCIES: Record<CurrencyCode, Currency<number>> = { XAF, XOF, EUR, USD };

function dineroCurrency(code?: CurrencyCode | string | null): Currency<number> {
  if (code && code in DINERO_CURRENCIES) {
    return DINERO_CURRENCIES[code as CurrencyCode];
  }
  return DINERO_CURRENCIES[DEFAULT_CURRENCY_CODE];
}

/** Convert a major-unit amount (e.g. 12.5 EUR) to integer minor units (1250). */
export function toMinorUnits(major: number, code?: CurrencyCode | string | null): number {
  const factor = 10 ** currencyDecimals(code);
  return Math.round((major + Number.EPSILON) * factor);
}

/** Convert integer minor units (1250) back to a major-unit number (12.5). */
export function fromMinorUnits(minor: number, code?: CurrencyCode | string | null): number {
  return minor / 10 ** currencyDecimals(code);
}

/** Sum integer minor-unit amounts exactly (dinero-backed). Inputs/outputs minor. */
export function sumMinor(amounts: number[], code?: CurrencyCode | string | null): number {
  const currency = dineroCurrency(code);
  const total = amounts.reduce(
    (acc, amount) => add(acc, dinero({ amount: Math.round(amount), currency })),
    dinero({ amount: 0, currency }),
  );
  return toSnapshot(total).amount;
}

/** Multiply an integer minor-unit amount by an integer quantity (dinero-backed). */
export function multiplyMinor(
  minor: number,
  quantity: number,
  code?: CurrencyCode | string | null,
): number {
  const product = multiply(
    dinero({ amount: Math.round(minor), currency: dineroCurrency(code) }),
    Math.round(quantity),
  );
  return toSnapshot(product).amount;
}

/** Format integer minor units for display with the currency symbol. */
export function formatCurrencyMinor(minor: number, code?: CurrencyCode | string | null): string {
  return formatCurrency(fromMinorUnits(minor, code), code);
}

/** Format integer minor units WITHOUT the currency symbol (printed receipts). */
export function formatAmountMinor(minor: number, code?: CurrencyCode | string | null): string {
  return formatAmount(fromMinorUnits(minor, code), code);
}
