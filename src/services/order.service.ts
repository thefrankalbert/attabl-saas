import type { SupabaseClient } from '@supabase/supabase-js';
import { createValidationMethods } from './order/order-validation';
import { createCreationMethods } from './order/order-creation';
import { createLifecycleMethods } from './order/order-lifecycle';
import { createQueryMethods } from './order/order-queries';

export type { OrderPreviewResult } from './order/order-types';

/**
 * Order service - handles order validation, price verification, and creation.
 *
 * Extracted from /api/orders/route.ts (209 lines → service + thin route).
 * Key security: server-side price verification prevents price fraud.
 */
export function createOrderService(supabase: SupabaseClient) {
  return {
    ...createLifecycleMethods(supabase),
    ...createQueryMethods(supabase),
    ...createValidationMethods(supabase),
    ...createCreationMethods(supabase),
  };
}
