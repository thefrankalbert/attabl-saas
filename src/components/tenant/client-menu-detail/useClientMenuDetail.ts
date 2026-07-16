'use client';

import { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Venue, Category, MenuItem, Tenant, Zone, Table, Menu } from '@/types/admin.types';
import { noopSubscribe } from '@/lib/utils/noop-subscribe';

// - Types -

export interface ClientMenuDetailPageProps {
  tenant: Tenant;
  venues: Venue[];
  menus: Menu[];
  transversalMenus?: Menu[];
  initialMenuSlug?: string;
  initialTable?: string;
  /** True when the scanned table already has an open session (soft warning). */
  tableOccupied?: boolean;
  initialVenueSlug?: string;
  initialSection?: string;
  initialItemId?: string;
  categories: Category[];
  itemsByCategory: { id: string; name: string; name_en?: string; items: MenuItem[] }[];
  zones: Zone[];
  tables: Table[];
}

export function useClientMenuDetail({
  tenant,
  venues,
  menus,
  transversalMenus = [],
  initialMenuSlug,
  initialTable,
  initialVenueSlug,
  initialSection,
  initialItemId,
  categories,
  itemsByCategory,
}: ClientMenuDetailPageProps) {
  const t = useTranslations('tenant');
  const locale = useLocale();
  const lang = locale.startsWith('en') ? 'en' : 'fr';
  const router = useRouter();
  const { toast } = useToast();
  const { resolveAndFormatPrice } = useDisplayCurrency();

  // - State -
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Table number (localStorage, hydration-safe) for the header subtitle.
  const tableNum = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(`attabl_${tenant.slug}_table`);
      } catch {
        return null;
      }
    },
    () => null,
  );

  // Menu navigation state - auto-select menu containing the target section
  const [activeMenuSlug, setActiveMenuSlug] = useState<string | null>(() => {
    if (initialMenuSlug) return initialMenuSlug;
    if (menus.length <= 1) return menus[0]?.slug || null;

    // If a section is requested, find the menu that contains it
    if (initialSection) {
      const targetCat = categories.find(
        (c) => c.name.toLowerCase() === decodeURIComponent(initialSection).toLowerCase(),
      );
      if (targetCat?.menu_id) {
        // Find the parent menu (or the menu itself)
        const parentMenu = menus.find(
          (m) =>
            m.id === targetCat.menu_id || m.children?.some((ch) => ch.id === targetCat.menu_id),
        );
        if (parentMenu) return parentMenu.slug;
      }
    }

    return menus[0]?.slug || null;
  });
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(() => {
    // If section targets a sub-menu category, auto-select that sub-menu
    if (initialSection && menus.length > 1) {
      const targetCat = categories.find(
        (c) => c.name.toLowerCase() === decodeURIComponent(initialSection).toLowerCase(),
      );
      if (targetCat?.menu_id) {
        const isSubMenu = menus.some((m) => m.children?.some((ch) => ch.id === targetCat.menu_id));
        if (isSubMenu) return targetCat.menu_id;
      }
    }
    return null;
  });

  // Venue filter state
  const [activeVenueId, setActiveVenueId] = useState<string | null>(() => {
    if (initialVenueSlug) {
      const venue = venues.find((v) => v.slug === initialVenueSlug);
      return venue?.id || null;
    }
    return null;
  });

  // Realtime availability overrides. A Map (not a "disabled" Set) so it can force
  // an item BOTH ways over its server-rendered value: an item that was unavailable
  // at page load must be able to flip back to available live, which a one-way
  // disabled-set cannot express.
  const [availabilityOverride, setAvailabilityOverride] = useState<Map<string, boolean>>(
    () => new Map(),
  );
  // Active category for the single sticky title bar (synced with CategoryNav).
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');

  const [isMenuSheetOpen, setIsMenuSheetOpen] = useState(false);

  // - Persist table from URL param to localStorage -
  useEffect(() => {
    if (initialTable) {
      localStorage.setItem(`attabl_${tenant.slug}_table`, initialTable);
    }
  }, [initialTable, tenant.slug]);

  // - Scroll to section on mount -
  useEffect(() => {
    if (!initialSection) return;

    const decodedSection = decodeURIComponent(initialSection).toLowerCase();
    const cat = categories.find((c) => c.name.toLowerCase() === decodedSection);
    if (!cat) return;

    // Native smooth scroll is a silent no-op on the #main-content scroller, so
    // jump the scroller directly (instant is fine for a mount-time deep link).
    // STICKY_OFFSET matches the section's scroll-mt-[170px] sticky stack.
    const scrollToCategory = () => {
      const scroller = document.getElementById('main-content');
      const el = document.getElementById(`cat-${cat.id}`);
      if (scroller && el) {
        // Nudge by the section's live distance from the sticky band (169px),
        // same rect-based method as CategoryNav (robust to offsetParent chains).
        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const delta = el.getBoundingClientRect().top - 169;
        scroller.scrollTop = Math.max(0, Math.min(scroller.scrollTop + delta, maxTop));
        return true;
      }
      return false;
    };

    // Try after initial render, retry if element not yet in DOM
    let t2: ReturnType<typeof setTimeout> | null = null;
    const t1 = setTimeout(() => {
      if (!scrollToCategory()) {
        t2 = setTimeout(scrollToCategory, 600);
      }
    }, 300);

    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [initialSection, categories]);

  // - Open item detail from URL param -
  useEffect(() => {
    if (!initialItemId) return;
    for (const group of itemsByCategory) {
      const found = group.items.find((i) => i.id === initialItemId);
      if (found) {
        setSelectedItem(found);
        return;
      }
    }
  }, [initialItemId, itemsByCategory]);

  // Realtime subscriptions.
  // Availability toggles (the most frequent staff action) are applied to local
  // state incrementally - no server round-trip, no full re-render. Structural
  // changes (item add/remove, category edits) still need the full cached menu
  // payload (with modifiers) re-fetched from the server, but we DEBOUNCE that
  // refresh so a burst of staff edits collapses into a single refresh per
  // device instead of one full server re-render per row changed.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      router.refresh();
    }, 1500);
  }, [router]);

  // Clear any pending debounced refresh on unmount (no leaked timer).
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  useRealtimeSubscription<{ id: string; is_available: boolean }>({
    channelName: `menu_items_realtime_${tenant.id}`,
    table: 'menu_items',
    filter: `tenant_id=eq.${tenant.id}`,
    onUpdate: (record) => {
      setAvailabilityOverride((prev) => {
        const next = new Map(prev);
        next.set(record.id, record.is_available);
        return next;
      });
    },
    onInsert: scheduleRealtimeRefresh,
    onDelete: scheduleRealtimeRefresh,
  });

  useRealtimeSubscription({
    channelName: `categories_realtime_${tenant.id}`,
    table: 'categories',
    filter: `tenant_id=eq.${tenant.id}`,
    onChange: scheduleRealtimeRefresh,
  });

  // Tenant settings (tax on/off, tax rate, currency, name, colors...) change live.
  // Only refresh when a storefront-relevant field actually changed: the tenants
  // row is also written by high-frequency housekeeping (last_active_at on every
  // admin page load, activation_events) - refreshing on those would churn every
  // open storefront while staff simply navigate the dashboard.
  const tenantSettingsSignature = useCallback(
    (t: Partial<Tenant>) =>
      JSON.stringify([
        t.name,
        t.logo_url,
        t.primary_color,
        t.secondary_color,
        t.font_family,
        t.currency,
        t.supported_currencies,
        t.tax_rate,
        t.service_charge_rate,
        t.enable_tax,
        t.enable_service_charge,
        t.enable_coupons,
        t.description,
        t.opening_hours,
        t.is_active,
      ]),
    [],
  );
  useRealtimeSubscription<Partial<Tenant> & Record<string, unknown>>({
    channelName: `tenant_settings_realtime_${tenant.id}`,
    table: 'tenants',
    filter: `id=eq.${tenant.id}`,
    onUpdate: (record) => {
      if (tenantSettingsSignature(record) !== tenantSettingsSignature(tenant)) {
        scheduleRealtimeRefresh();
      }
    },
  });

  // - Filtering logic -

  // Filter menus by venue
  const filteredMenus = activeVenueId
    ? menus.filter((m) => m.venue_id === activeVenueId || !m.venue_id)
    : menus;

  // Reset menu when venue changes
  useEffect(() => {
    if (filteredMenus.length > 0 && !filteredMenus.find((m) => m.slug === activeMenuSlug)) {
      setActiveMenuSlug(filteredMenus[0].slug);
      setActiveSubMenuId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reset menu only when venue changes, not on every filteredMenus/activeMenuSlug mutation (2026-05-04)
  }, [activeVenueId]);

  const activeMenu = filteredMenus.find((m) => m.slug === activeMenuSlug) || null;

  // Filter items by menu/submenu
  // When multiple menus exist (or transversal menus are present), only show
  // categories explicitly linked to the active menu. Categories with no menu_id
  // are excluded (they must be assigned to a menu in admin).
  const hasMultipleMenus = menus.length > 1 || transversalMenus.length > 0;
  const menuFilteredByCategory = !hasMultipleMenus
    ? itemsByCategory
    : itemsByCategory.filter((cat) => {
        if (!activeMenu) return true;
        const category = categories.find((c) => c.id === cat.id);
        if (!category?.menu_id) return false;
        if (activeSubMenuId) {
          return category.menu_id === activeSubMenuId;
        }
        const activeMenuIds = [activeMenu.id, ...(activeMenu.children?.map((c) => c.id) || [])];
        return activeMenuIds.includes(category.menu_id);
      });

  const allItems = useMemo(() => itemsByCategory.flatMap((cat) => cat.items), [itemsByCategory]);

  // Normalize text: lowercase + strip accents (e.g. "Taginé" -> "tagine", "Café" -> "cafe")
  const normalize = useCallback(
    (text: string) =>
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''),
    [],
  );

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = normalize(searchQuery);
    return allItems
      .filter((item) => {
        const name = normalize(item.name || '');
        const nameEn = normalize(item.name_en || '');
        const desc = normalize(item.description || '');
        return name.includes(q) || nameEn.includes(q) || desc.includes(q);
      })
      .slice(0, 8);
  }, [allItems, searchQuery, normalize]);

  // - Handlers -

  const handleTableSelect = (table: Table) => {
    localStorage.setItem(`attabl_${tenant.slug}_table`, table.table_number);
    toast({
      title: t('tableSelected'),
      description: t('seatedAtTable', { table: table.table_number }),
    });
  };

  const handleMenuChange = (slug: string) => {
    setActiveMenuSlug(slug);
    setActiveSubMenuId(null);
    // Auto-sync venue when the selected menu is bound to one.
    // Prevents a stale venue filter when the venue tabs row is hidden.
    const next = menus.find((m) => m.slug === slug);
    if (next?.venue_id) setActiveVenueId(next.venue_id);
  };

  // Hide the venue-tabs row when the menu-tabs row already covers venues.
  // Rule: if every carte is bound to a venue (menu.venue_id IS NOT NULL),
  // picking a carte implicitly picks its venue, so showing both rows is
  // a redundant duplication (see CONTEXT.md section "Venue/Carte UI rule").
  const hideVenueRow = filteredMenus.length > 1 && filteredMenus.every((m) => !!m.venue_id);

  // Hide the menu-tabs row when the user entered via a specific carte URL
  // (?menu=slug). They already chose a carte - showing all the other cartes
  // again is navigation noise. A back link to the cartes list is offered
  // instead via the header back button.
  const hideMenuTabsRow = !!initialMenuSlug && filteredMenus.length > 1;

  // - Render prep -
  const headerVenueLabel = activeVenueId
    ? (venues.find((v) => v.id === activeVenueId)?.name ?? null)
    : null;
  const headerSubtitle = [tableNum ? t('tableLabel', { num: tableNum }) : null, headerVenueLabel]
    .filter(Boolean)
    .join(' - ');

  const toggleSearch = () => {
    setShowSearch((s) => !s);
    setSearchQuery('');
  };

  const canSwitchMenu = filteredMenus.length > 1 || venues.length > 1;

  return {
    t,
    lang,
    router,
    resolveAndFormatPrice,
    selectedItem,
    setSelectedItem,
    isTablePickerOpen,
    setIsTablePickerOpen,
    searchQuery,
    setSearchQuery,
    showSearch,
    toggleSearch,
    activeSubMenuId,
    setActiveSubMenuId,
    activeVenueId,
    setActiveVenueId,
    availabilityOverride,
    activeCategoryId,
    setActiveCategoryId,
    isMenuSheetOpen,
    setIsMenuSheetOpen,
    filteredMenus,
    activeMenu,
    activeMenuSlug,
    menuFilteredByCategory,
    searchResults,
    handleTableSelect,
    handleMenuChange,
    hideVenueRow,
    hideMenuTabsRow,
    headerSubtitle,
    canSwitchMenu,
  };
}
