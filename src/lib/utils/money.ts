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

import { CURRENCIES, type CurrencyCode, DEFAULT_CURRENCY_CODE } from '@/lib/constants';

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
