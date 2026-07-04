'use client';

import CategoryNav from '@/components/tenant/CategoryNav';
import TablePicker from '@/components/tenant/TablePicker';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import {
  useClientMenuDetail,
  type ClientMenuDetailPageProps,
} from '@/components/tenant/client-menu-detail/useClientMenuDetail';
import MenuDetailHeader from '@/components/tenant/client-menu-detail/MenuDetailHeader';
import MenuSearchResults from '@/components/tenant/client-menu-detail/MenuSearchResults';
import SubMenuTabs from '@/components/tenant/client-menu-detail/SubMenuTabs';
import MenuItemsList from '@/components/tenant/client-menu-detail/MenuItemsList';
import MenuSelectionSheet from '@/components/tenant/client-menu-detail/MenuSelectionSheet';

// - Component -

export default function ClientMenuDetailPage(props: ClientMenuDetailPageProps) {
  const { tenant, venues, transversalMenus = [], zones, tables } = props;

  const {
    lang,
    router,
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
    disabledItemIds,
    activeCategoryId,
    setActiveCategoryId,
    isMenuSheetOpen,
    setIsMenuSheetOpen,
    filteredMenus,
    activeMenu,
    activeMenuSlug,
    menuFilteredByCategory,
    filteredCategories,
    searchResults,
    handleTableSelect,
    handleMenuChange,
    hideVenueRow,
    hideMenuTabsRow,
    headerSubtitle,
    canSwitchMenu,
  } = useClientMenuDetail(props);

  // - Render -
  return (
    <div
      className="flex-1 w-full bg-white"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* - HEADER - */}
      <MenuDetailHeader
        tenantName={tenant.name}
        headerSubtitle={headerSubtitle}
        canSwitchMenu={canSwitchMenu}
        showSearch={showSearch}
        searchQuery={searchQuery}
        onBack={() => router.push(`/sites/${tenant.slug}`)}
        onOpenMenuSheet={() => setIsMenuSheetOpen(true)}
        onToggleSearch={toggleSearch}
        onSearchChange={(value) => setSearchQuery(value)}
        onClearSearch={() => setSearchQuery('')}
      />

      {/* - SEARCH RESULTS OVERLAY - */}
      {searchQuery.length >= 2 && (
        <MenuSearchResults
          searchQuery={searchQuery}
          searchResults={searchResults}
          lang={lang as 'fr' | 'en'}
          currency={tenant.currency}
          onSelectItem={(item) => {
            setSelectedItem(item);
            setSearchQuery('');
          }}
        />
      )}

      {/* - SUB-MENU TABS - */}
      {activeMenu &&
        ((activeMenu.children && activeMenu.children.length > 0) ||
          transversalMenus.length > 0) && (
          <SubMenuTabs
            activeMenu={activeMenu}
            transversalMenus={transversalMenus}
            activeSubMenuId={activeSubMenuId}
            lang={lang as 'fr' | 'en'}
            onSelectSubMenu={setActiveSubMenuId}
          />
        )}

      {/* - CATEGORY NAVIGATION (sticky breadcrumb) - */}
      {filteredCategories && filteredCategories.length > 0 && (
        <CategoryNav
          categories={filteredCategories}
          topOffset={63}
          onActiveChange={setActiveCategoryId}
        />
      )}

      {/* Single sticky category title bar - reflects the active category (synced
          with the chips). Replaces per-section sticky headers, which overlapped
          and flashed the next title on short adjacent categories. */}
      {menuFilteredByCategory.length > 0 && (
        <div className="sticky top-[111px] z-20 border-b border-[#EEEEEE] bg-white px-4 pt-4 pb-[14px]">
          <h2 className="text-[20px] font-bold leading-[1.4] tracking-[-0.6px] text-[#1A1A1A]">
            {
              (
                menuFilteredByCategory.find((c) => c.id === activeCategoryId) ??
                menuFilteredByCategory[0]
              )?.name
            }
          </h2>
        </div>
      )}

      {/* - MENU ITEMS LIST - */}
      <MenuItemsList
        categories={menuFilteredByCategory}
        disabledItemIds={disabledItemIds}
        restaurantId={tenant.id}
        currency={tenant.currency}
        lang={lang as 'fr' | 'en'}
        onOpenDetail={setSelectedItem}
      />

      {/* - MODALS - */}
      <TablePicker
        isOpen={isTablePickerOpen}
        onClose={() => setIsTablePickerOpen(false)}
        onSelect={handleTableSelect}
        zones={zones}
        tables={tables}
      />

      <ItemDetailSheet
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        restaurantId={tenant.id}
        currency={tenant.currency}
      />

      <MenuSelectionSheet
        isOpen={isMenuSheetOpen}
        onOpenChange={setIsMenuSheetOpen}
        filteredMenus={filteredMenus}
        hideMenuTabsRow={hideMenuTabsRow}
        activeMenuSlug={activeMenuSlug}
        onMenuChange={handleMenuChange}
        venues={venues}
        hideVenueRow={hideVenueRow}
        activeVenueId={activeVenueId}
        onSelectVenue={setActiveVenueId}
        onCloseSheet={() => setIsMenuSheetOpen(false)}
      />
    </div>
  );
}
