'use client';

import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Supplier } from '@/types/supplier.types';

interface SupplierCardProps {
  supplier: Supplier;
  openEdit: (supplier: Supplier) => void;
  onToggleActive: (supplier: Supplier) => void;
}

// Mobile card view for a single supplier (ResponsiveDataTable mobileConfig.renderCard).
export default function SupplierCard({ supplier, openEdit, onToggleActive }: SupplierCardProps) {
  const t = useTranslations('suppliers');

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3">
      {/* Row 1: Name + Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-app-text break-words">{supplier.name}</p>
          {supplier.contact_name && (
            <p className="text-xs text-app-text-secondary">{supplier.contact_name}</p>
          )}
        </div>
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium shrink-0',
            supplier.is_active
              ? 'bg-status-success-bg text-status-success'
              : 'bg-app-bg text-app-text-secondary',
          )}
        >
          {supplier.is_active ? t('active') : t('inactive')}
        </span>
      </div>

      {/* Row 2: Contact info */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-app-text-secondary">
        {supplier.phone && <span>{supplier.phone}</span>}
        {supplier.email && <span className="break-all">{supplier.email}</span>}
      </div>

      {/* Row 3: Actions */}
      <div className="flex justify-end gap-1 pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openEdit(supplier)}
          className="gap-1 text-xs min-h-[44px]"
        >
          <Pencil className="w-3 h-3" />
          {t('edit')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(supplier)}
          className="text-xs min-h-[44px]"
        >
          {supplier.is_active ? t('disable') : t('enable')}
        </Button>
      </div>
    </div>
  );
}
