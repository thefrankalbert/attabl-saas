'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Venue, Category, MenuItem, Ad, Tenant, Zone, Table, Menu } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import AdsSlider from '@/components/tenant/AdsSlider';
import ClientShortcuts from '@/components/tenant/ClientShortcuts';
import BottomNav from '@/components/tenant/BottomNav';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import CategoryNav from '@/components/tenant/CategoryNav';
import TablePicker from '@/components/tenant/TablePicker';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import type { QRScanResult } from '@/components/tenant/QRScanner';
import SearchOverlay from '@/components/tenant/SearchOverlay';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-neutral-100 rounded-lg" />,
});

interface ClientMenuPageProps {
  tenant: Tenant;
  venues: Venue[];
  menus: Menu[];
  initialMenuSlug?: string;
  initialTable?: string;
  initialVenueSlug?: string;
  categories: Category[];
  itemsByCategory: { id: string; name: string; items: MenuItem[] }[];
  ads: Ad[];
  zones: Zone[];
  tables: Table[];
}

export default function ClientMenuPage({
  tenant,
  venues,
  menus,
  initialMenuSlug,
  initialTable,
  initialVenueSlug,
  categories,
  itemsByCategory,
  ads,
  zones,
  tables,
}: ClientMenuPageProps) {
  const t = useTranslations('tenant');
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState<string | null>(initialTable || null);

  // Menu tab state
  const [activeMenuSlug, setActiveMenuSlug] = useState<string | null>(
    initialMenuSlug || (menus.length > 1 ? menus[0]?.slug || null : null),
  );
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(null);

  // Venue filter state
  const [activeVenueId, setActiveVenueId] = useState<string | null>(() => {
    if (initialVenueSlug) {
      const venue = venues.find((v) => v.slug === initialVenueSlug);
      return venue?.id || null;
    }
    return null;
  });

  // Table auto-detection from URL: show toast once on initial load
  // Using useState initializer (runs once) to avoid ref access during render
  const [tableToastShown] = useState(() => {
    if (initialTable && typeof window !== 'undefined') {
      localStorage.setItem('attabl_table', initialTable);
      queueMicrotask(() => {
        toast({
          title: t('tableIdentified'),
          description: t('seatedAtTable', { table: initialTable }),
        });
      });
      return true;
    }
    return false;
  });
  // Suppress unused var warning — tableToastShown is only used as a run-once guard
  void tableToastShown;

  // Filter menus by active venue (show venue menus + shared menus with no venue_id)
  const filteredMenus = activeVenueId
    ? menus.filter((m) => m.venue_id === activeVenueId || !m.venue_id)
    : menus;

  // Reset menu selection when venue changes
  useEffect(() => {
    if (filteredMenus.length > 0 && !filteredMenus.find((m) => m.slug === activeMenuSlug)) {
      setActiveMenuSlug(filteredMenus[0].slug);
      setActiveSubMenuId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVenueId]);

  // Realtime: track availability changes for menu items
  const [disabledItemIds, setDisabledItemIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`menu_realtime_${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'menu_items',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; is_available: boolean };
          setDisabledItemIds((prev) => {
            const next = new Set(prev);
            if (!updated.is_available) {
              next.add(updated.id);
            } else {
              next.delete(updated.id);
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [tenant.id]);

  // Derive active menu from slug (using venue-filtered menus)
  const activeMenu = filteredMenus.find((m) => m.slug === activeMenuSlug) || null;

  // Filter itemsByCategory based on active menu (backward compatible)
  const filteredItemsByCategory =
    menus.length <= 1
      ? itemsByCategory
      : itemsByCategory.filter((cat) => {
          if (!activeMenu) return true;
          // Collect IDs of the active menu and its children
          const activeMenuIds = [activeMenu.id, ...(activeMenu.children?.map((c) => c.id) || [])];
          // If sub-menu is selected, narrow further
          if (activeSubMenuId) {
            const category = categories.find((c) => c.id === cat.id);
            return category?.menu_id === activeSubMenuId;
          }
          // Otherwise show all categories belonging to active menu or its children
          const category = categories.find((c) => c.id === cat.id);
          return !category?.menu_id || activeMenuIds.includes(category.menu_id);
        });

  // Filter categories for CategoryNav
  const filteredCategories =
    menus.length <= 1
      ? categories
      : categories.filter((c) => {
          if (!activeMenu) return true;
          const activeMenuIds = [activeMenu.id, ...(activeMenu.children?.map((ch) => ch.id) || [])];
          if (activeSubMenuId) {
            return c.menu_id === activeSubMenuId;
          }
          return !c.menu_id || activeMenuIds.includes(c.menu_id);
        });

  const allItems = useMemo(() => itemsByCategory.flatMap((cat) => cat.items), [itemsByCategory]);

  const handleTableSelect = (table: Table) => {
    setTableNumber(table.table_number);
    toast({
      title: t('tableSelected'),
      description: t('seatedAtTable', { table: table.table_number }),
    });
    // Persist logic here if needed (context or localStorage)
    localStorage.setItem('attabl_table', table.table_number);
  };

  const handleQRScan = (result: QRScanResult) => {
    if (result.tableNumber) {
      // Try to match the scanned table number to a known table
      const matchedTable = tables.find(
        (t) =>
          t.table_number === result.tableNumber ||
          t.table_number === result.tableNumber?.toUpperCase() ||
          t.display_name === result.tableNumber,
      );

      if (matchedTable) {
        handleTableSelect(matchedTable);
      } else {
        // Table number found in QR but not in our database — use it anyway
        setTableNumber(result.tableNumber);
        localStorage.setItem('attabl_table', result.tableNumber);
        toast({
          title: t('tableIdentified'),
          description: t('seatedAtTable', { table: result.tableNumber }),
        });
      }
    } else {
      toast({
        title: t('qrScanned'),
        description: t('noTableDetected'),
        variant: 'destructive',
      });
    }

    // Auto-switch to the menu specified in the QR code
    if (result.menuSlug) {
      const matchedMenu = menus.find((m) => m.slug === result.menuSlug);
      if (matchedMenu) {
        setActiveMenuSlug(matchedMenu.slug);
        setActiveSubMenuId(null);
      }
    }
  };

  // Reset sub-menu when changing main menu
  const handleMenuChange = (slug: string) => {
    setActiveMenuSlug(slug);
    setActiveSubMenuId(null);
  };

  return (
    <div className="pb-32">
      {/* Header */}
      <header className="sticky top-0 z-40">
        <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-b border-neutral-100" />
        <div className="relative max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tenant.logo_url ? (
              <Image
                src={tenant.logo_url}
                alt={tenant.name}
                width={120}
                height={40}
                className="h-10 w-auto object-contain"
                priority
              />
            ) : (
              <h1 className="text-xl font-bold" style={{ color: 'var(--tenant-primary)' }}>
                {tenant.name}
              </h1>
            )}
          </div>
          {tableNumber && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 rounded-full">
              <span className="text-xs font-semibold text-neutral-700">Table {tableNumber}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Ads Banner */}
        {ads && ads.length > 0 && <AdsSlider ads={ads} />}

        {/* Quick Actions */}
        <ClientShortcuts
          onSearchClick={() => setIsQRScannerOpen(true)} // Example: Search mapped to QR for now or Table Picker
          primaryColor={tenant.primary_color || '#000000'}
          // Extend ClientShortcuts to accept onDineInClick -> Open Table Picker
        />

        {/* Venues Selector */}
        {venues && venues.length > 1 && (
          <div className="mb-6">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
              <button
                onClick={() => setActiveVenueId(null)}
                className={cn(
                  'flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap',
                  !activeVenueId
                    ? 'text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                )}
                style={!activeVenueId ? { backgroundColor: 'var(--tenant-primary)' } : undefined}
              >
                {t('allSpaces')}
              </button>
              {venues.map((venue: Venue) => (
                <button
                  key={venue.id}
                  onClick={() => setActiveVenueId(venue.id)}
                  className={cn(
                    'flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap',
                    activeVenueId === venue.id
                      ? 'text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                  )}
                  style={
                    activeVenueId === venue.id
                      ? { backgroundColor: 'var(--tenant-primary)' }
                      : undefined
                  }
                >
                  {venue.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Menu Tabs (only if multiple menus) */}
        {filteredMenus.length > 1 && (
          <div
            className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-4 px-4"
            data-tab-pane
          >
            {filteredMenus.map((menu) => (
              <button
                key={menu.slug}
                onClick={() => handleMenuChange(menu.slug)}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap',
                  activeMenuSlug === menu.slug
                    ? 'text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                )}
                style={
                  activeMenuSlug === menu.slug
                    ? { backgroundColor: 'var(--tenant-primary)' }
                    : undefined
                }
              >
                {menu.name}
              </button>
            ))}
          </div>
        )}

        {/* Sub-menu tabs (sous-cartes) */}
        {activeMenu?.children && activeMenu.children.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-4 px-4">
            <button
              onClick={() => setActiveSubMenuId(null)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                !activeSubMenuId
                  ? 'text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
              )}
              style={!activeSubMenuId ? { backgroundColor: 'var(--tenant-primary)' } : undefined}
            >
              {t('all')}
            </button>
            {activeMenu.children
              .filter((c) => c.is_active)
              .map((child) => (
                <button
                  key={child.slug}
                  onClick={() => setActiveSubMenuId(child.id)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                    activeSubMenuId === child.id
                      ? 'text-white'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
                  )}
                  style={
                    activeSubMenuId === child.id
                      ? { backgroundColor: 'var(--tenant-primary)' }
                      : undefined
                  }
                >
                  {child.name}
                </button>
              ))}
          </div>
        )}

        {/* Category Navigation */}
        {filteredCategories && filteredCategories.length > 0 && (
          <CategoryNav categories={filteredCategories} />
        )}

        {/* Menu Items */}
        {filteredItemsByCategory.length > 0 ? (
          <div className="space-y-8 sm:space-y-10 mt-4 sm:mt-6">
            {filteredItemsByCategory.map(
              (category) =>
                category.items.length > 0 && (
                  <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-32">
                    <div className="flex items-center gap-3 mb-4 px-1">
                      <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest">
                        {category.name}
                      </h2>
                      <div className="h-px bg-neutral-100 flex-1"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
                      {category.items.map((item: MenuItem) => {
                        const isRealtimeDisabled = disabledItemIds.has(item.id);
                        const effectiveItem = isRealtimeDisabled
                          ? { ...item, is_available: false }
                          : item;
                        return (
                          <MenuItemCard
                            key={item.id}
                            item={effectiveItem}
                            restaurantId={tenant.id}
                            category={category.name}
                            currency={tenant.currency}
                            onOpenDetail={() => setSelectedItem(effectiveItem)}
                          />
                        );
                      })}
                    </div>
                  </section>
                ),
            )}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm mx-auto">
              <p className="text-neutral-500 font-medium">{t('noMenuAvailable')}</p>
            </div>
          </div>
        )}
      </main>

      {/* Feature Modals */}
      <TablePicker
        isOpen={isTablePickerOpen}
        onClose={() => setIsTablePickerOpen(false)}
        onSelect={handleTableSelect}
        zones={zones}
        tables={tables}
      />

      <QRScanner
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScan={handleQRScan}
        tables={tables}
      />

      {/* Install Prompt */}
      <InstallPrompt appName={tenant.name} logoUrl={tenant.logo_url} />

      {/* Item Detail Sheet */}
      <ItemDetailSheet
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        restaurantId={tenant.id}
        currency={tenant.currency}
      />

      {/* Search Overlay */}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        items={allItems}
        restaurantId={tenant.id}
        currency={tenant.currency}
        onOpenDetail={(item) => {
          setIsSearchOpen(false);
          setSelectedItem(item);
        }}
      />

      {/* Bottom Nav */}
      <BottomNav
        tenantSlug={tenant.slug}
        primaryColor={tenant.primary_color || '#000000'}
        onSearchClick={() => setIsSearchOpen(true)}
      />
    </div>
  );
}
