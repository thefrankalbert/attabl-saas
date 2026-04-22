'use client';

import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, MapPin, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Tenant } from '@/types/admin.types';
import { MENU_COLORS as C } from '@/lib/tenant/menu-tokens';

interface TenantInfoSheetProps {
  tenant: Tenant;
  isOpen: boolean;
  onClose: () => void;
  closeLabel?: string;
}

export function TenantInfoSheet({ tenant, isOpen, onClose, closeLabel }: TenantInfoSheetProps) {
  const addressLine = [tenant.address, tenant.city, tenant.country].filter(Boolean).join(', ');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="tenant-info-sheet"
          className="fixed inset-0 z-[62] flex h-dvh max-h-dvh flex-col bg-white"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {/* Top close button */}
          <div className="flex-shrink-0 flex justify-end p-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-app-elevated"
              aria-label={closeLabel || 'Fermer'}
            >
              <X size={18} color={C.textPrimary} />
            </Button>
          </div>

          {/* Hero: large logo + name */}
          <div className="flex-shrink-0 flex flex-col items-center px-6 pb-4">
            <div
              className="w-24 h-24 rounded-3xl overflow-hidden flex items-center justify-center"
              style={{ backgroundColor: C.surfaceAlt }}
            >
              {tenant.logo_url ? (
                <Image
                  src={tenant.logo_url}
                  alt={tenant.name}
                  width={96}
                  height={96}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span className="text-4xl font-bold" style={{ color: C.textMuted }}>
                  {tenant.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <h2
              className="mt-4 text-center font-bold text-2xl leading-[32px]"
              style={{ color: C.textPrimary }}
            >
              {tenant.name}
            </h2>
            {tenant.establishment_type && (
              <p
                className="mt-1 text-center font-medium uppercase text-[11px] tracking-[1px]"
                style={{ color: C.textMuted }}
              >
                {tenant.establishment_type}
              </p>
            )}
          </div>

          {/* Body: description + contact rows */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {tenant.description && (
              <p className="mt-2 text-[15px] leading-[22px]" style={{ color: C.textSecondary }}>
                {tenant.description}
              </p>
            )}

            {/* Contact rows */}
            <div className="mt-6 flex flex-col gap-3">
              {addressLine && (
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: C.surfaceAlt }}
                  >
                    <MapPin size={16} color={C.textPrimary} />
                  </div>
                  <span className="text-sm leading-9" style={{ color: C.textPrimary }}>
                    {addressLine}
                  </span>
                </div>
              )}
              {tenant.phone && (
                <a href={`tel:${tenant.phone}`} className="flex items-center gap-3 no-underline">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: C.surfaceAlt }}
                  >
                    <Phone size={16} color={C.textPrimary} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: C.textPrimary }}>
                    {tenant.phone}
                  </span>
                </a>
              )}
              {tenant.establishment_type &&
                !tenant.description &&
                !addressLine &&
                !tenant.phone && (
                  <div className="flex items-center gap-3 mt-2">
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        backgroundColor: C.surfaceAlt,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Building2 size={16} color={C.textPrimary} />
                    </div>
                    <span className="text-sm" style={{ color: C.textPrimary }}>
                      {tenant.establishment_type}
                    </span>
                  </div>
                )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
