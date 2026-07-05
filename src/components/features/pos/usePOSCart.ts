'use client';

import { useState, useMemo, useEffect } from 'react';

import type { Zone, Table } from '@/types/admin.types';
import type { CartItem } from '@/hooks/usePOSData';

// Local UI state + derived values for the POS cart panel.
export function usePOSCart(zones: Zone[], allTables: Table[], cart: CartItem[]) {
  // --- Order notes toggle ---------------------------------
  const [showOrderNotes, setShowOrderNotes] = useState(false);

  // --- Table Picker Dialog --------------------------------
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [pickerZoneId, setPickerZoneId] = useState<string | null>(null);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);

  // Initialize picker zone when dialog opens
  useEffect(() => {
    if (showTablePicker && zones.length > 0 && !pickerZoneId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: one-time default zone selection when the picker dialog opens; guarded by !pickerZoneId so it sets once and cannot loop (2026-06-18)
      setPickerZoneId(zones[0].id);
    }
  }, [showTablePicker, zones, pickerZoneId]);

  // Tables for the selected zone in the picker
  const pickerTables = useMemo(() => {
    if (!pickerZoneId) return [];
    return allTables
      .filter((tbl) => tbl.zone_id === pickerZoneId)
      .sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true }));
  }, [pickerZoneId, allTables]);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return {
    showOrderNotes,
    setShowOrderNotes,
    showTablePicker,
    setShowTablePicker,
    pickerZoneId,
    setPickerZoneId,
    showClearCartConfirm,
    setShowClearCartConfirm,
    pickerTables,
    totalItems,
  };
}
