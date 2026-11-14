import { z } from 'zod';

/**
 * Validation for super-admin (god-mode) Command Center actions.
 * Reasons are bounded so audit-trail rows stay sane; ids must be UUIDs.
 */

const reason = z.string().trim().max(500).optional();

export const tenantActionSchema = z.object({
  tenantId: z.string().uuid(),
  reason,
});

export const adminUserActionSchema = z.object({
  adminUserId: z.string().uuid(),
  reason,
});
