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

interface TaxConfig {
  enable_tax?: boolean;
  tax_rate?: number;
  enable_service_charge?: boolean;
  service_charge_rate?: number;
}

/**
 * Calculate tax amount based on tenant settings
 */
export function calculateTax(subtotal: number, config: TaxConfig): number {
  if (!config.enable_tax || !config.tax_rate || config.tax_rate <= 0) return 0;
  // Round to 2 decimal places
  return Math.round(((subtotal * config.tax_rate) / 100) * 100) / 100;
}

/**
 * Calculate service charge based on tenant settings
 */
export function calculateServiceCharge(subtotal: number, config: TaxConfig): number {
  if (
    !config.enable_service_charge ||
    !config.service_charge_rate ||
    config.service_charge_rate <= 0
  )
    return 0;
  return Math.round(((subtotal * config.service_charge_rate) / 100) * 100) / 100;
}

/**
 * Calculate complete order pricing breakdown
 *
 * @param subtotal - Sum of all items (including modifiers)
 * @param config - Tenant tax/service configuration
 * @param discountAmount - Coupon discount already calculated
 * @returns Full pricing breakdown
 *
 * @example
 * const breakdown = calculateOrderTotal(10000, { enable_tax: true, tax_rate: 18, enable_service_charge: true, service_charge_rate: 10 }, 0);
 * // { subtotal: 10000, taxAmount: 1800, serviceChargeAmount: 1000, discountAmount: 0, total: 12800 }
 */
export function calculateOrderTotal(
  subtotal: number,
  config: TaxConfig,
  discountAmount: number = 0,
): PricingBreakdown {
  const taxAmount = calculateTax(subtotal, config);
  const serviceChargeAmount = calculateServiceCharge(subtotal, config);
  const total = subtotal + taxAmount + serviceChargeAmount - discountAmount;

  return {
    subtotal,
    taxAmount,
    serviceChargeAmount,
    discountAmount,
    total: Math.max(0, Math.round(total * 100) / 100), // Never negative, rounded
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
