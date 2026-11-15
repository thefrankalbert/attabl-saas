'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import type { ServiceType } from '@/types/admin.types';

interface DestinationState {
  extrasLoaded: boolean;
  extrasError: boolean;
  serviceType: ServiceType;
  selectedTable: string;
  allTables: readonly unknown[];
  deliveryAddress: string;
  roomNumber: string;
}

/**
 * Everything a ticket needs to reach its destination, checked BEFORE the
 * payment step: the server (or the kitchen table rule) used to refuse it only
 * after the money was taken. Dine-in needs a table (owner decision 2026-11-14)
 * unless no table is configured; a delivery an address; a room service a room
 * number. Settings never loaded (not even from the offline cache): the till
 * cannot know the taxes and would quote a wrong amount, so nothing goes yet.
 * Returns a check that tells the cashier what is missing (toast) and whether
 * the order may go.
 */
export function usePosDestinationCheck(pos: DestinationState): () => boolean {
  const t = useTranslations('pos');
  const { toast } = useToast();
  const { extrasLoaded, extrasError, serviceType, selectedTable, deliveryAddress, roomNumber } =
    pos;
  const hasTables = pos.allTables.length > 0;

  return useCallback((): boolean => {
    if (!extrasLoaded) {
      toast({
        title: extrasError ? t('settingsLoadError') : t('settingsLoading'),
        variant: extrasError ? 'destructive' : 'default',
      });
      return false;
    }
    if (serviceType === 'dine_in' && !selectedTable && hasTables) {
      toast({
        title: t('tableRequired'),
        description: t('tableRequiredDesc'),
        variant: 'destructive',
      });
      return false;
    }
    if (serviceType === 'delivery' && !deliveryAddress.trim()) {
      toast({ title: t('deliveryAddressRequired'), variant: 'destructive' });
      return false;
    }
    if (serviceType === 'room_service' && !roomNumber.trim()) {
      toast({ title: t('roomNumberRequired'), variant: 'destructive' });
      return false;
    }
    return true;
  }, [
    extrasLoaded,
    extrasError,
    serviceType,
    selectedTable,
    hasTables,
    deliveryAddress,
    roomNumber,
    toast,
    t,
  ]);
}
