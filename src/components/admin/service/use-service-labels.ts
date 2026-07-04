'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

// Builds the memoized label bundles handed down to the Service dashboard
// sub-components (floor plan, metrics bar, right panel, table detail).
// Extracted verbatim from ServiceManager to keep the orchestrator small;
// no logic or i18n keys changed.
export function useServiceLabels() {
  const t = useTranslations('service');
  const tc = useTranslations('common');

  const floorLabels = useMemo(
    () => ({
      allTab: tc('all'),
      gridMode: t('gridMode'),
      planMode: t('planMode'),
      searchPlaceholder: t('searchPlaceholder'),
      free: t('statusFree'),
      occupied: t('statusOccupied'),
      reserved: t('statusOccupied'),
      cleaning: t('statusOccupied'),
      noTablesMatch: t('noTablesMatch'),
      seatsShort: t('seatsShort'),
      emptyServerDropHint: t('dropServerHint'),
      emptyServerCleaningHint: t('dropServerHint'),
      emptyServerReserved: t('dropServerHint'),
      sinceSince: t('sinceSince'),
      occupiedSummary: t('occupiedSummary'),
      freeSummary: t('freeSummary'),
      reservedSummary: t('reservedSummary'),
      releaseAria: t('releaseAssignment'),
      filteredByServerLabel: (name: string) => t('filteredByServer', { name }),
      clearFilterAria: t('clearFilter'),
      planSelectZone: t('planSelectZone'),
      roomPlanLabel: t('roomPlanLabel'),
      editLayout: t('editLayout'),
      exitEditLayout: t('exitEditLayout'),
      resetLayout: t('resetLayout'),
      editModeHint: t('editModeHint'),
    }),
    [t, tc],
  );

  const metricsLabels = useMemo(
    () => ({
      occupationRate: t('occupationRate'),
      waitTime: t('avgWaitTime'),
      minShort: t('minShort'),
      occupiedSummary: t('occupiedSummary'),
      freeSummary: t('freeSummary'),
      reservedSummary: t('reservedSummary'),
      cleaningSummary: t('cleaningSummary'),
      activeAssignments: t('activeAssignmentsShort'),
      tablesTotal: t('tablesTotal'),
      coversLabel: t('coversLabel'),
      coversSub: t('coversSub'),
    }),
    [t],
  );

  const panelLabels = useMemo(
    () => ({
      tabServers: t('tabServers'),
      tabOrders: t('tabOrders'),
      inService: t('inService'),
      available: t('available'),
      onBreak: t('onBreak'),
      availableStateEmpty: t('availableEmpty'),
      inServiceEmpty: t('inServiceEmpty'),
      ordersTitle: t('ordersActiveTitle'),
      ordersEmpty: t('ordersEmpty'),
      dragHint: t('dragHint'),
      markDelivered: t('markDelivered'),
      tableShort: t('tableShort'),
      itemsCount: (count: number) => t('itemsCount', { count }),
      minutesAgoShort: (min: number) => t('minutesAgoShort', { min }),
      roleLabel: t('roleLabel'),
      availableStatus: t('availableStatus'),
      tablesPlural: (n: number) => t('tablesPlural', { count: n }),
    }),
    [t],
  );

  const detailLabels = useMemo(
    () => ({
      closeAria: tc('close'),
      tableLabel: t('tableLabel'),
      seatsLabel: t('seatsLabel'),
      statusFree: t('statusFree'),
      statusOccupied: t('statusOccupied'),
      infoSection: t('infoSection'),
      roomLabel: t('roomLabel'),
      seatsRow: t('seatsRow'),
      arrivalRow: t('arrivalRow'),
      assignedServerSection: t('assignedServerSection'),
      noServerAssigned: t('noServerAssigned'),
      selectServer: t('selectServer'),
      releaseBtn: t('release'),
      currentOrderSection: t('currentOrderSection'),
      orderEmpty: t('orderEmpty'),
      orderOpened: t('orderOpened'),
      orderTotal: tc('total'),
    }),
    [t, tc],
  );

  return { floorLabels, metricsLabels, panelLabels, detailLabels };
}
