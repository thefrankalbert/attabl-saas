'use client';

import { useOrderReadyAlert } from '@/hooks/useOrderReadyAlert';

/** Mounted once in the admin shell so the ready alert fires on every screen. */
export function OrderReadyAlert({
  tenantId,
  adminUserId,
}: {
  tenantId: string;
  adminUserId?: string;
}) {
  useOrderReadyAlert(tenantId, adminUserId);
  return null;
}
