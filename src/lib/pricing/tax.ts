/**
 * Tax & Service Charge Calculation
 *
 * Centralized pricing logic used by:
 * - CartContext (client-side preview)
 * - Order API (server-side verification)
 * - PaymentModal (display)
 * - Receipt printing
 */

import type { PricingBreakdown } from '@/types/admin.types';
import type { CurrencyCode } from '@/lib/constants';
import { roundForCurrency } from '@/lib/utils/money';

interface TaxConfig {
  enable_tax?: boolean;
  tax_rate?: number;
  enable_service_charge?: boolean;
  service_charge_rate?: number;
}

/**
 * Calculate tax amount based on tenant settings, rounded to the currency's
 * smallest unit (audit H1: XAF/XOF are zero-decimal so a 59.94 result must be
 * 60). Defaults to the platform currency (XAF) when none is given.
 */
export function calculateTax(
  subtotal: number,
  config: TaxConfig,
  currencyCode?: CurrencyCode | string | null,
): number {
  if (!config.enable_tax || !config.tax_rate || config.tax_rate <= 0) return 0;
  return roundForCurrency((subtotal * config.tax_rate) / 100, currencyCode);
}

/**
 * Calculate service charge based on tenant settings, currency-aware rounding.
 */
export function calculateServiceCharge(
  subtotal: number,
  config: TaxConfig,
  currencyCode?: CurrencyCode | string | null,
): number {
  if (
    !config.enable_service_charge ||
    !config.service_charge_rate ||
    config.service_charge_rate <= 0
  )
    return 0;
  return roundForCurrency((subtotal * config.service_charge_rate) / 100, currencyCode);
}

/**
 * Calculate complete order pricing breakdown
 *
 * @param subtotal - Sum of all items (including modifiers)
 * @param config - Tenant tax/service configuration
 * @param discountAmount - Coupon discount already calculated
 * @returns Full pricing breakdown
 *
 * Tax and service charge are computed on the discounted base
 * (subtotal - discount), so a coupon reduces the taxable amount.
 *
 * @example
 * const breakdown = calculateOrderTotal(10000, { enable_tax: true, tax_rate: 18, enable_service_charge: true, service_charge_rate: 10 }, 0);
 * // { subtotal: 10000, taxAmount: 1800, serviceChargeAmount: 1000, discountAmount: 0, total: 12800 }
 */
export function calculateOrderTotal(
  subtotal: number,
  config: TaxConfig,
  discountAmount: number = 0,
  currencyCode?: CurrencyCode | string | null,
): PricingBreakdown {
  const taxableBase = Math.max(0, subtotal - discountAmount);
  const taxAmount = calculateTax(taxableBase, config, currencyCode);
  const serviceChargeAmount = calculateServiceCharge(taxableBase, config, currencyCode);
  const total = taxableBase + taxAmount + serviceChargeAmount;

  return {
    subtotal,
    taxAmount,
    serviceChargeAmount,
    discountAmount,
    // Never negative, rounded to the currency's smallest unit (audit H1).
    total: Math.max(0, roundForCurrency(total, currencyCode)),
  };
}

/**
 * Validate that a client-provided total matches server calculation
 * Uses 1% tolerance for floating point rounding differences
 */
export function validateTotal(clientTotal: number, serverTotal: number): boolean {
  if (serverTotal === 0) return clientTotal === 0;
  const tolerance = Math.max(serverTotal * 0.01, 1); // At least 1 unit tolerance
  return Math.abs(clientTotal - serverTotal) <= tolerance;
}
