'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ─── Types ──────────────────────────────────────────────

export type DisplayCurrency = 'XAF' | 'EUR' | 'USD';

interface CurrencyContextValue {
  /** The user's chosen display currency */
  displayCurrency: DisplayCurrency;
  /** Update the display currency (persisted to localStorage) */
  setDisplayCurrency: (code: DisplayCurrency) => void;
  /**
   * Format a price for display, converting from `baseCurrency` to the
   * user's display currency.
   * @param amount   - price in the base (tenant) currency
   * @param baseCurrency - the tenant's native currency (default: XAF)
   */
  formatDisplayPrice: (amount: number, baseCurrency?: string) => string;
  /**
   * Resolve the correct price (manual or auto-converted) and format it.
   * 1. If displayCurrency === baseCurrency → return basePrice directly
   * 2. If manualPrices[displayCurrency] exists → use exact manual price
   * 3. Else → auto-convert (fallback)
   */
  resolveAndFormatPrice: (
    basePrice: number,
    manualPrices?: Record<string, number> | null,
    baseCurrency?: string,
  ) => string;
  /** Currencies the tenant supports for display */
  supportedCurrencies: DisplayCurrency[];
}

// ─── Constants ──────────────────────────────────────────

const STORAGE_KEY = 'attabl_display_currency';

/**
 * Conversion rates TO XAF.
 * XAF ↔ EUR is fixed (CFA franc pegged to Euro: 1 EUR = 655.957 XAF).
 * USD rate is approximate and should be updated periodically.
 */
const RATES_TO_XAF: Record<string, number> = {
  XAF: 1,
  EUR: 655.957,
  USD: 610,
};

// ─── Helpers ────────────────────────────────────────────

function readStored(fallback: string): DisplayCurrency {
  if (typeof window === 'undefined') return fallback as DisplayCurrency;
  return (localStorage.getItem(STORAGE_KEY) as DisplayCurrency) || (fallback as DisplayCurrency);
}

function convert(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const fromRate = RATES_TO_XAF[from] ?? 1;
  const toRate = RATES_TO_XAF[to] ?? 1;
  // from → XAF → to
  return (amount * fromRate) / toRate;
}

/** Format number with visible thin-space (U+2009) thousands separator */
function formatWithThinSpace(n: number, decimals = 0): string {
  const [int, dec] = n.toFixed(decimals).split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  return dec !== undefined ? `${withSep},${dec}` : withSep;
}

function formatConverted(amount: number, currency: DisplayCurrency): string {
  switch (currency) {
    case 'XAF':
      return `${formatWithThinSpace(Math.round(amount))} FCFA`;
    case 'EUR':
      return `${formatWithThinSpace(amount, 2)} €`;
    case 'USD':
      return `$${formatWithThinSpace(amount, 2)}`;
    default:
      return `${formatWithThinSpace(Math.round(amount))} FCFA`;
  }
}

// ─── Context ────────────────────────────────────────────

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  children,
  tenantCurrency = 'XAF',
  supportedCurrencies: supportedCurrenciesProp,
}: {
  children: ReactNode;
  tenantCurrency?: string;
  supportedCurrencies?: string[];
}) {
  const supportedCurrencies = (supportedCurrenciesProp || [tenantCurrency]) as DisplayCurrency[];

  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(() =>
    readStored(tenantCurrency),
  );

  const setDisplayCurrency = useCallback((code: DisplayCurrency) => {
    setDisplayCurrencyState(code);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, code);
    }
  }, []);

  const formatDisplayPrice = useCallback(
    (amount: number, baseCurrency?: string) => {
      const base = baseCurrency || tenantCurrency;
      const converted = convert(amount, base, displayCurrency);
      return formatConverted(converted, displayCurrency);
    },
    [displayCurrency, tenantCurrency],
  );

  const resolveAndFormatPrice = useCallback(
    (
      basePrice: number,
      manualPrices?: Record<string, number> | null,
      baseCurrency?: string,
    ): string => {
      const base = baseCurrency || tenantCurrency;

      // 1. Same currency → no conversion needed
      if (displayCurrency === base) {
        return formatConverted(basePrice, displayCurrency);
      }

      // 2. Manual price exists → use it directly
      if (
        manualPrices &&
        manualPrices[displayCurrency] != null &&
        manualPrices[displayCurrency]! > 0
      ) {
        return formatConverted(manualPrices[displayCurrency]!, displayCurrency);
      }

      // 3. Fallback → auto-convert
      const converted = convert(basePrice, base, displayCurrency);
      return formatConverted(converted, displayCurrency);
    },
    [displayCurrency, tenantCurrency],
  );

  return (
    <CurrencyContext.Provider
      value={{
        displayCurrency,
        setDisplayCurrency,
        formatDisplayPrice,
        resolveAndFormatPrice,
        supportedCurrencies,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useDisplayCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Fallback for components outside the provider (e.g., tests)
    return {
      displayCurrency: 'XAF' as DisplayCurrency,
      setDisplayCurrency: () => {},
      formatDisplayPrice: (amount: number) => `${Math.round(amount).toLocaleString('fr-FR')} FCFA`,
      resolveAndFormatPrice: (amount: number) =>
        `${Math.round(amount).toLocaleString('fr-FR')} FCFA`,
      supportedCurrencies: ['XAF'] as DisplayCurrency[],
    };
  }
  return ctx;
}
