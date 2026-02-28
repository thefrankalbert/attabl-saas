'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Plus, FileSpreadsheet, FileText, Search } from 'lucide-react';
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
    toggleActive,
    reorder,
    loadMenus,
  } = useMenusData({ tenantId, initialMenus, venues });

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl xl:text-2xl font-bold text-text-primary tracking-tight">
              {t('title')}
            </h1>
            <p className="text-sm text-text-secondary mt-1">{t('subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowImportModal(true)}
              variant="outline"
              className="gap-2 rounded-xl"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t('importExcel')}
            </Button>
            <Button
              onClick={() => setShowPdfImportModal(true)}
              variant="outline"
              className="gap-2 rounded-xl"
            >
              <FileText className="w-4 h-4" />
              {t('importPdf')}
            </Button>
            <Button
              onClick={() => openNewMenuModal()}
              variant="lime"
              disabled={isLimitReached}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('newMenu')}
            </Button>
          </div>
        </div>

        {/* Limit warning */}
        {isLimitReached && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800 font-medium">
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <Input
            data-search-input
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Menu list */}
        <MenusTable
          tenantSlug={tenantSlug}
          menus={menus}
          venues={venues}
          filteredStandalone={filteredStandalone}
          menusByVenue={menusByVenue}
          searchQuery={searchQuery}
          loading={loading}
          onEdit={openEditMenuModal}
          onDelete={deleteMenu}
          onToggle={toggleActive}
          onAddChild={(parentId) => openNewMenuModal(parentId)}
          onReorder={reorder}
          onCreateFirst={() => openNewMenuModal()}
        />

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
