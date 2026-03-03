'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Plus, FileSpreadsheet, FileText, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AdminModal from '@/components/admin/AdminModal';
import { useMenusData } from '@/hooks/useMenusData';
import type { MenuFormData } from '@/hooks/useMenusData';
import MenuForm from '@/components/features/menus/MenuForm';
import MenuImportExcel from '@/components/features/menus/MenuImportExcel';
import MenuImportPDF from '@/components/features/menus/MenuImportPDF';
import MenusTable from '@/components/features/menus/MenusTable';
import RoleGuard from '@/components/admin/RoleGuard';
import type { Menu, Venue } from '@/types/admin.types';

interface MenusClientProps {
  tenantId: string;
  tenantSlug: string;
  initialMenus: Menu[];
  venues: Venue[];
}

export default function MenusClient({
  tenantId,
  tenantSlug,
  initialMenus,
  venues,
}: MenusClientProps) {
  const t = useTranslations('menus');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPdfImportModal, setShowPdfImportModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [parentMenuId, setParentMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Data hook
  const {
    menus,
    loading,
    searchQuery,
    setSearchQuery,
    filteredStandalone,
    menusByVenue,
    isLimitReached,
    maxMenus,
    createMenu,
    updateMenu,
    deleteMenu,
    deleteMultiple,
    toggleActive,
    reorder,
    loadMenus,
  } = useMenusData({ tenantId, initialMenus, venues });

  // ─── Selection ────────────────────────────────────────

  const toggleSelect = useCallback((menuId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(menuId)) next.delete(menuId);
      else next.add(menuId);
      return next;
    });
  }, []);

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    await deleteMultiple(ids);
    setSelectedIds(new Set());
  };

  // ─── Modal openers ─────────────────────────────────────

  const openNewMenuModal = useCallback((parentId?: string) => {
    setEditingMenu(null);
    setParentMenuId(parentId || null);
    setShowModal(true);
  }, []);

  const openEditMenuModal = useCallback((menu: Menu) => {
    setEditingMenu(menu);
    setParentMenuId(null);
    setShowModal(true);
  }, []);

  // ─── Form submit handler ──────────────────────────────

  const handleFormSubmit = async (data: MenuFormData) => {
    try {
      if (editingMenu) {
        await updateMenu(editingMenu.id, data);
      } else {
        await createMenu(data);
      }
      setShowModal(false);
    } catch {
      // Error already toasted by hook — keep modal open
    }
  };

  return (
    <RoleGuard permission="canManageMenus">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 space-y-3">
          {/* Header + Search + Actions — single row */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-app-text tracking-tight shrink-0">
              {t('title')}
            </h1>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text-muted" />
              <Input
                data-search-input
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {selectedIds.size > 0 && (
                <Button
                  onClick={handleDeleteSelected}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0 text-red-600 border-red-200 hover:bg-red-500/10 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('deleteSelected', { count: selectedIds.size })}</span>
                </Button>
              )}
              <Button
                onClick={() => setShowImportModal(true)}
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">{t('importExcel')}</span>
              </Button>
              <Button
                onClick={() => setShowPdfImportModal(true)}
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">{t('importPdf')}</span>
              </Button>
              <Button
                onClick={() => openNewMenuModal()}
                variant="default"
                size="sm"
                disabled={isLimitReached}
                className="gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{t('newMenu')}</span>
              </Button>
            </div>
          </div>

          {/* Limit warning */}
          {isLimitReached && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2">
              <p className="text-xs text-amber-800 font-medium">
                {t('limitReached', { max: maxMenus })}{' '}
                <Link
                  href={`/sites/${tenantSlug}/admin/subscription`}
                  className="underline font-bold"
                >
                  {t('upgradeToPremium')}
                </Link>
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
          {/* Menu list */}
          <MenusTable
            tenantSlug={tenantSlug}
            menus={menus}
            venues={venues}
            filteredStandalone={filteredStandalone}
            menusByVenue={menusByVenue}
            searchQuery={searchQuery}
            loading={loading}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onEdit={openEditMenuModal}
            onDelete={deleteMenu}
            onToggle={toggleActive}
            onAddChild={(parentId) => openNewMenuModal(parentId)}
            onReorder={reorder}
            onCreateFirst={() => openNewMenuModal()}
          />
        </div>

        {/* Create/Edit Modal */}
        <AdminModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingMenu ? t('editMenuTitle') : t('newMenuTitle')}
          size="lg"
        >
          {showModal && (
            <MenuForm
              key={editingMenu?.id ?? 'new'}
              editingMenu={editingMenu}
              menus={menus}
              venues={venues}
              parentMenuId={parentMenuId}
              onSubmit={handleFormSubmit}
              onCancel={() => setShowModal(false)}
            />
          )}
        </AdminModal>

        {/* Import Excel Modal */}
        <AdminModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title={t('importExcel')}
          size="lg"
        >
          {showImportModal && (
            <MenuImportExcel
              menus={menus}
              onImportComplete={loadMenus}
              onCancel={() => setShowImportModal(false)}
            />
          )}
        </AdminModal>

        {/* Import PDF Modal */}
        <AdminModal
          isOpen={showPdfImportModal}
          onClose={() => setShowPdfImportModal(false)}
          title={t('importPdfTitle')}
          size="lg"
        >
          {showPdfImportModal && (
            <MenuImportPDF
              menus={menus}
              onImportComplete={loadMenus}
              onCancel={() => setShowPdfImportModal(false)}
            />
          )}
        </AdminModal>
      </div>
    </RoleGuard>
  );
}
