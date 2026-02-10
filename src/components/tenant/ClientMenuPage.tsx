'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useToast } from '@/components/ui/use-toast';
import { Venue, Category, MenuItem, Ad, Tenant, Zone, Table, Menu } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import AdsSlider from '@/components/tenant/AdsSlider';
import ClientShortcuts from '@/components/tenant/ClientShortcuts';
import BottomNav from '@/components/tenant/BottomNav';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import CategoryNav from '@/components/tenant/CategoryNav';
import CartSummary from '@/components/tenant/CartSummary';
import TablePicker from '@/components/tenant/TablePicker';
import QRScanner, { QRScanResult } from '@/components/tenant/QRScanner';

interface ClientMenuPageProps {
  tenant: Tenant;
  venues: Venue[];
  menus: Menu[];
  initialMenuSlug?: string;
  initialTable?: string;
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
  categories,
  itemsByCategory,
  ads,
  zones,
  tables,
}: ClientMenuPageProps) {
  const { toast } = useToast();
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState<string | null>(initialTable || null);

  // Menu tab state
  const [activeMenuSlug, setActiveMenuSlug] = useState<string | null>(
    initialMenuSlug || (menus.length > 1 ? menus[0]?.slug || null : null),
  );
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(null);

  // Table auto-detection from URL: show toast once on initial load
  // Using useState initializer (runs once) to avoid ref access during render
  const [tableToastShown] = useState(() => {
    if (initialTable && typeof window !== 'undefined') {
      localStorage.setItem('attabl_table', initialTable);
      queueMicrotask(() => {
        toast({
          title: 'Table identifi\u00e9e',
          description: `Vous \u00eates install\u00e9(e) \u00e0 la table ${initialTable}`,
        });
      });
      return true;
    }
    return false;
  });
  // Suppress unused var warning — tableToastShown is only used as a run-once guard
  void tableToastShown;

  // Derive active menu from slug
  const activeMenu = menus.find((m) => m.slug === activeMenuSlug) || null;

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

  const handleTableSelect = (table: Table) => {
    setTableNumber(table.table_number);
    toast({
      title: 'Table s\u00e9lectionn\u00e9e',
      description: `Vous \u00eates install\u00e9 \u00e0 la table ${table.table_number}`,
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
          title: 'Table identifi\u00e9e',
          description: `Table ${result.tableNumber} via QR code`,
        });
      }
    } else {
      toast({
        title: 'QR Code scann\u00e9',
        description: 'Aucun num\u00e9ro de table d\u00e9tect\u00e9 dans ce QR code.',
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
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
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

          {tableNumber && (
            <div className="text-xs font-semibold px-2 py-1 bg-gray-100 rounded-lg text-gray-600">
              Table {tableNumber}
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

        {/* Temporary Button for Table Picker until ClientShortcuts is fully wired */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          <button
            onClick={() => setIsTablePickerOpen(true)}
            className="px-4 py-2 bg-white border rounded-lg text-sm font-medium whitespace-nowrap"
          >
            Choisir ma table
          </button>
          <button
            onClick={() => setIsQRScannerOpen(true)}
            className="px-4 py-2 bg-white border rounded-lg text-sm font-medium whitespace-nowrap"
          >
            Scanner QR
          </button>
        </div>

        {/* Venues Selector */}
        {venues && venues.length > 1 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3 px-1">Nos espaces</h2>
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
              {venues.map((venue: Venue) => (
                <button
                  key={venue.id}
                  className="flex-shrink-0 px-5 py-3 bg-white rounded-xl shadow-sm border border-gray-100 whitespace-nowrap hover:shadow-md transition-all font-medium text-sm"
                >
                  {venue.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Menu Tabs (only if multiple menus) */}
        {menus.length > 1 && (
          <div
            className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-4 px-4"
            data-tab-pane
          >
            {menus.map((menu) => (
              <button
                key={menu.slug}
                onClick={() => handleMenuChange(menu.slug)}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap',
                  activeMenuSlug === menu.slug
                    ? 'bg-gray-900 text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
                )}
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
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              )}
            >
              Tout
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
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                  )}
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
                      <h2 className="text-lg font-extrabold text-gray-900 uppercase tracking-tight">
                        {category.name}
                      </h2>
                      <div className="h-px bg-gray-200 flex-1"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                      {category.items.map((item: MenuItem) => (
                        <div
                          key={item.id}
                          className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                        >
                          <MenuItemCard
                            item={item}
                            restaurantId={tenant.id}
                            category={category.name}
                            accentColor={
                              tenant.primary_color
                                ? `text-[${tenant.primary_color}]`
                                : 'text-amber-600'
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                ),
            )}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm mx-auto">
              <p className="text-gray-500 font-medium">Aucun menu disponible pour le moment.</p>
            </div>
          </div>
        )}
      </main>

      {/* Cart Summary — floating FAB visible on all screen sizes */}
      <CartSummary />

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

      {/* Bottom Nav */}
      <BottomNav
        tenantSlug={tenant.slug}
        primaryColor={tenant.primary_color || '#000000'}
        onSearchClick={() => {
          /* TODO */
        }}
      />
    </div>
  );
}
