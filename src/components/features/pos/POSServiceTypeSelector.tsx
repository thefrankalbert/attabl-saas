'use client';

import { useMemo } from 'react';

import { UtensilsCrossed, Package, Truck, BellRing, LayoutGrid } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/contexts/SubscriptionContext';
import type { ServiceType } from '@/types/admin.types';

interface POSServiceTypeSelectorProps {
  serviceType: ServiceType;
  setServiceType: (type: ServiceType) => void;
  selectedTable: string;
  roomNumber: string;
  setRoomNumber: (room: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (address: string) => void;
  onOpenTablePicker: () => void;
}

export function POSServiceTypeSelector({
  serviceType,
  setServiceType,
  selectedTable,
  roomNumber,
  setRoomNumber,
  deliveryAddress,
  setDeliveryAddress,
  onOpenTablePicker,
}: POSServiceTypeSelectorProps) {
  const t = useTranslations('pos');
  const { canAccess } = useSubscription();

  // Delivery + room service are plan-gated (Business+, see pricing-data.ts). Hide the
  // buttons the plan does not include so staff never pick a mode the order route
  // would reject (server enforces the same rule in /api/orders/pos).
  const SERVICE_TYPES = useMemo<{ value: ServiceType; label: string; icon: React.ReactNode }[]>(
    () =>
      [
        {
          value: 'dine_in' as const,
          label: t('serviceOnSite'),
          icon: <UtensilsCrossed className="w-3.5 h-3.5" />,
        },
        {
          value: 'takeaway' as const,
          label: t('serviceTakeaway'),
          icon: <Package className="w-3.5 h-3.5" />,
        },
        {
          value: 'delivery' as const,
          label: t('serviceDelivery'),
          icon: <Truck className="w-3.5 h-3.5" />,
          enabled: canAccess('canAccessDelivery'),
        },
        {
          value: 'room_service' as const,
          label: t('serviceRoomService'),
          icon: <BellRing className="w-3.5 h-3.5" />,
          enabled: canAccess('canAccessRoomService'),
        },
      ].filter((st) => st.enabled !== false),
    [t, canAccess],
  );

  return (
    <div className="p-3 border-b border-app-border space-y-2 shrink-0">
      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-1.5">
        {SERVICE_TYPES.map((st) => (
          <Button
            key={st.value}
            type="button"
            variant={serviceType === st.value ? 'default' : 'outline'}
            onClick={() => setServiceType(st.value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 min-h-[44px] text-xs font-medium',
              serviceType === st.value
                ? 'bg-accent text-accent-text'
                : 'text-app-text-secondary hover:bg-app-hover',
            )}
          >
            {st.icon}
            <span className="truncate">{st.label}</span>
          </Button>
        ))}
      </div>

      {serviceType === 'dine_in' && (
        <Button
          type="button"
          variant="outline"
          onClick={onOpenTablePicker}
          className="flex items-center gap-2 h-9 px-3 rounded-lg bg-app-elevated text-app-text-secondary text-sm hover:bg-app-hover hover:text-app-text animate-in fade-in slide-in-from-top-1"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>{selectedTable || t('selectTable')}</span>
        </Button>
      )}

      {serviceType === 'room_service' && (
        <Input
          placeholder={t('roomNumberPlaceholder')}
          value={roomNumber}
          onChange={(e) => setRoomNumber(e.target.value)}
          className="h-9 animate-in fade-in slide-in-from-top-1"
        />
      )}

      {serviceType === 'delivery' && (
        <Textarea
          placeholder={t('deliveryAddressPlaceholder')}
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          className="w-full h-16 p-2 text-base md:text-sm border border-app-border rounded-lg bg-app-elevated text-app-text placeholder:text-app-text-muted outline-none focus:border-accent/40 resize-none animate-in fade-in slide-in-from-top-1"
        />
      )}
    </div>
  );
}
