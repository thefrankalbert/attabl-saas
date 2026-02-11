/**
 * Multi-Currency Formatting Utilities
 *
 * Supports XAF (FCFA), EUR (€), USD ($)
 * Use formatCurrency() everywhere instead of hardcoded "FCFA"
 */

import { CURRENCIES, type CurrencyCode, DEFAULT_CURRENCY_CODE } from '@/lib/constants';

export type CurrencyConfig = (typeof CURRENCIES)[CurrencyCode];

/**
 * Get the configuration for a given currency code
 */
export function getCurrencyConfig(code?: CurrencyCode | string | null): CurrencyConfig {
  if (code && code in CURRENCIES) {
    return CURRENCIES[code as CurrencyCode];
  }
  return CURRENCIES[DEFAULT_CURRENCY_CODE];
}

/**
 * Format an amount with the correct currency symbol and locale
 *
 * @example
 * formatCurrency(1000)           // "1 000 FCFA"
 * formatCurrency(1000, 'XAF')    // "1 000 FCFA"
 * formatCurrency(12.5, 'EUR')    // "12,50 €"
 * formatCurrency(12.5, 'USD')    // "$12.50"
 */
export function formatCurrency(
  amount: number,
  currencyCode?: CurrencyCode | string | null,
): string {
  const config = getCurrencyConfig(currencyCode);

  const formatted = new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  }).format(amount);

  if (config.position === 'before') {
    return `${config.symbol}${formatted}`;
  }
  return `${formatted} ${config.symbol}`;
}

/**
 * Format a compact currency amount (for small UI elements)
 *
 * @example
 * formatCurrencyCompact(1500000, 'XAF') // "1,5M FCFA"
 * formatCurrencyCompact(1500, 'EUR')     // "1 500,00 €"
 */
export function formatCurrencyCompact(
  amount: number,
  currencyCode?: CurrencyCode | string | null,
): string {
  const config = getCurrencyConfig(currencyCode);

  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const formatted = new Intl.NumberFormat(config.locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(millions);
    return config.position === 'before'
      ? `${config.symbol}${formatted}M`
      : `${formatted}M ${config.symbol}`;
  }

  return formatCurrency(amount, currencyCode);
}

/**
 * Format an amount WITHOUT the currency symbol (for printed receipts)
 *
 * @example
 * formatAmount(1000, 'XAF')    // "1 000"
 * formatAmount(12.5, 'EUR')    // "12,50"
 * formatAmount(12.5, 'USD')    // "12.50"
 */
export function formatAmount(amount: number, currencyCode?: CurrencyCode | string | null): string {
  const config = getCurrencyConfig(currencyCode);

  return new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  }).format(amount);
}

/**
 * Get just the currency symbol
 */
export function getCurrencySymbol(currencyCode?: CurrencyCode | string | null): string {
  return getCurrencyConfig(currencyCode).symbol;
}
