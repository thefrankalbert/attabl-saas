'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Plus,
  Folder,
  ChevronRight,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Building2,
  Search,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMenus } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/contexts/SubscriptionContext';
import {
  actionCreateMenu,
  actionUpdateMenu,
  actionDeleteMenu,
  actionReorderMenus,
} from '@/app/actions/menus';
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
  const [showModal, setShowModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Import Excel state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    categoriesCreated: number;
    itemsCreated: number;
    itemsSkipped: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDescriptionEn, setFormDescriptionEn] = useState('');
  const [formVenueId, setFormVenueId] = useState<string | null>(null);
  const [formParentMenuId, setFormParentMenuId] = useState<string | null>(null);
  const [formIsActive, setFormIsActive] = useState(true);

  const { toast } = useToast();
  const { isLimitReached, limits } = useSubscription();
  const queryClient = useQueryClient();
  const t = useTranslations('menus');
  const tc = useTranslations('common');

  // TanStack Query for menus
  const { data: menus = initialMenus, isLoading: loading } = useMenus(tenantId, initialMenus);

  const loadMenus = () => {
    queryClient.invalidateQueries({ queryKey: ['menus', tenantId] });
  };

  const openNewMenuModal = (parentId?: string) => {
    setEditingMenu(null);
    setFormName('');
    setFormNameEn('');
    setFormDescription('');
    setFormDescriptionEn('');
    setFormVenueId(null);
    setFormParentMenuId(parentId || null);
    setFormIsActive(true);
    setShowModal(true);
  };

  const openEditMenuModal = (menu: Menu) => {
    setEditingMenu(menu);
    setFormName(menu.name);
    setFormNameEn(menu.name_en || '');
    setFormDescription(menu.description || '');
    setFormDescriptionEn(menu.description_en || '');
    setFormVenueId(menu.venue_id);
    setFormParentMenuId(menu.parent_menu_id);
    setFormIsActive(menu.is_active);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);

    try {
      if (editingMenu) {
        const result = await actionUpdateMenu(tenantId, {
          id: editingMenu.id,
          name: formName.trim(),
          name_en: formNameEn.trim() || undefined,
          description: formDescription.trim() || undefined,
          description_en: formDescriptionEn.trim() || undefined,
          venue_id: formVenueId,
          parent_menu_id: formParentMenuId,
          is_active: formIsActive,
        });
        if (result.error) {
          toast({ title: result.error, variant: 'destructive' });
          return;
        }
        toast({ title: t('menuUpdated') });
      } else {
        const result = await actionCreateMenu(tenantId, {
          name: formName.trim(),
          name_en: formNameEn.trim() || undefined,
          description: formDescription.trim() || undefined,
          description_en: formDescriptionEn.trim() || undefined,
          venue_id: formVenueId,
          parent_menu_id: formParentMenuId,
          is_active: formIsActive,
          display_order: menus.length,
        });
        if (result.error) {
          toast({ title: result.error, variant: 'destructive' });
          return;
        }
        toast({ title: t('menuCreated') });
      }
      setShowModal(false);
      loadMenus();
    } catch {
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (menu: Menu) => {
    if (!confirm(t('deleteConfirm', { name: menu.name }))) return;

    try {
      const result = await actionDeleteMenu(tenantId, menu.id);
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: t('menuDeleted') });
      loadMenus();
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    }
  };

  const handleToggleActive = async (menu: Menu) => {
    try {
      const result = await actionUpdateMenu(tenantId, {
        id: menu.id,
        is_active: !menu.is_active,
      });
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }
      loadMenus();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const handleReorder = async (dragIndex: number, dropIndex: number) => {
    const reordered = [...menus];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    // Optimistic update in query cache
    queryClient.setQueryData(['menus', tenantId], reordered);

    const orderedIds = reordered.map((m) => m.id);
    await actionReorderMenus(tenantId, orderedIds);
  };

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const openImportModal = () => {
    setImportFile(null);
    setImportResult(null);
    setImporting(false);
    setIsDragOver(false);
    setShowImportModal(true);
  };

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: t('maxFileSize'), variant: 'destructive' });
      return;
    }
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      toast({ title: t('importError'), variant: 'destructive' });
      return;
    }
    setImportFile(file);
    setImportResult(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('tenantId', tenantId);

      const response = await fetch('/api/menu-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ title: data.error || t('importError'), variant: 'destructive' });
        setImportResult({
          categoriesCreated: 0,
          itemsCreated: 0,
          itemsSkipped: 0,
          errors: data.errors || [],
        });
        return;
      }

      setImportResult({
        categoriesCreated: data.categoriesCreated ?? 0,
        itemsCreated: data.itemsCreated ?? 0,
        itemsSkipped: data.itemsSkipped ?? 0,
        errors: data.errors ?? [],
      });

      toast({ title: t('importSuccess') });
      loadMenus();
    } catch {
      toast({ title: t('importError'), variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Group menus by venue
  const standaloneMenus = menus.filter((m) => !m.venue_id);
  const menusByVenue = venues.reduce<Record<string, Menu[]>>((acc, venue) => {
    const venueMenus = menus.filter((m) => m.venue_id === venue.id);
    if (venueMenus.length > 0) acc[venue.id] = venueMenus;
    return acc;
  }, {});

  const filteredStandalone = standaloneMenus.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const limitReached = isLimitReached('maxMenus', menus.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">{t('title')}</h1>
          <p className="text-sm text-neutral-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openImportModal} variant="outline" className="gap-2 rounded-xl">
            <FileSpreadsheet className="w-4 h-4" />
            {t('importExcel')}
          </Button>
          <Button
            onClick={() => openNewMenuModal()}
            variant="lime"
            disabled={limitReached}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('newMenu')}
          </Button>
        </div>
      </div>

      {/* Limit warning */}
      {limitReached && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800 font-medium">
            {t('limitReached', { max: limits.maxMenus })}{' '}
            <Link href={`/sites/${tenantSlug}/admin/subscription`} className="underline font-bold">
              {t('upgradeToPremium')}
            </Link>
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <Input
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-white rounded-xl border border-neutral-100 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Standalone menus */}
      {filteredStandalone.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest px-1">
            {t('independentMenus')}
          </p>
          {filteredStandalone.map((menu, index) => (
            <MenuCard
              key={menu.id}
              menu={menu}
              tenantSlug={tenantSlug}
              index={index}
              onEdit={() => openEditMenuModal(menu)}
              onDelete={() => handleDelete(menu)}
              onToggle={() => handleToggleActive(menu)}
              onAddChild={() => openNewMenuModal(menu.id)}
              onReorder={handleReorder}
            />
          ))}
        </div>
      )}

      {/* Menus by venue */}
      {Object.entries(menusByVenue).map(([venueId, venueMenus]) => {
        const venue = venues.find((v) => v.id === venueId);
        const filtered = venueMenus.filter((m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );
        if (filtered.length === 0) return null;

        return (
          <div key={venueId} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Building2 className="w-4 h-4 text-neutral-400" />
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                {venue?.name || t('space')}
              </p>
            </div>
            {filtered.map((menu, index) => (
              <MenuCard
                key={menu.id}
                menu={menu}
                tenantSlug={tenantSlug}
                index={index}
                onEdit={() => openEditMenuModal(menu)}
                onDelete={() => handleDelete(menu)}
                onToggle={() => handleToggleActive(menu)}
                onAddChild={() => openNewMenuModal(menu.id)}
                onReorder={handleReorder}
              />
            ))}
          </div>
        );
      })}

      {/* Empty state */}
      {menus.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-neutral-100 p-12 text-center">
          <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Folder className="w-7 h-7 text-neutral-400" />
          </div>
          <h3 className="text-base font-bold text-neutral-900">{t('noMenus')}</h3>
          <p className="text-sm text-neutral-500 mt-2">{t('noMenusDesc')}</p>
          <Button onClick={() => openNewMenuModal()} variant="lime" className="mt-4">
            {t('createMenu')}
          </Button>
        </div>
      )}

      {/* Create/Edit Modal */}
      <AdminModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingMenu ? t('editMenuTitle') : t('newMenuTitle')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="menu-name" className="text-neutral-900">
                {t('nameFr')}
              </Label>
              <Input
                id="menu-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('nameFrPlaceholder')}
                className="rounded-lg border border-neutral-100 text-neutral-900 focus-visible:ring-lime-400"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menu-name-en" className="text-neutral-900">
                {t('nameEn')}
              </Label>
              <Input
                id="menu-name-en"
                value={formNameEn}
                onChange={(e) => setFormNameEn(e.target.value)}
                placeholder={t('nameEnPlaceholder')}
                className="rounded-lg border border-neutral-100 text-neutral-900 focus-visible:ring-lime-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="menu-desc" className="text-neutral-900">
                {t('descriptionFr')}
              </Label>
              <Input
                id="menu-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t('descriptionFrPlaceholder')}
                className="rounded-lg border border-neutral-100 text-neutral-900 focus-visible:ring-lime-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menu-desc-en" className="text-neutral-900">
                {t('descriptionEn')}
              </Label>
              <Input
                id="menu-desc-en"
                value={formDescriptionEn}
                onChange={(e) => setFormDescriptionEn(e.target.value)}
                placeholder={t('descriptionEnPlaceholder')}
                className="rounded-lg border border-neutral-100 text-neutral-900 focus-visible:ring-lime-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="menu-venue" className="text-neutral-900">
                {t('spaceOptional')}
              </Label>
              <select
                id="menu-venue"
                value={formVenueId || ''}
                onChange={(e) => setFormVenueId(e.target.value || null)}
                className="w-full rounded-lg border border-neutral-100 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-lime-400"
              >
                <option value="">{t('noSpaceIndependent')}</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menu-parent" className="text-neutral-900">
                {t('parentMenu')}
              </Label>
              <select
                id="menu-parent"
                value={formParentMenuId || ''}
                onChange={(e) => setFormParentMenuId(e.target.value || null)}
                className="w-full rounded-lg border border-neutral-100 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-lime-400"
              >
                <option value="">{t('noParentMain')}</option>
                {menus
                  .filter((m) => m.id !== editingMenu?.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="menu-active"
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
              className="rounded border-neutral-200 text-lime-500 focus:ring-lime-400"
            />
            <Label htmlFor="menu-active" className="text-neutral-900">
              {t('activeVisibleToClients')}
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving} variant="lime">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingMenu ? t('update') : t('create')}
            </Button>
          </div>
        </form>
      </AdminModal>

      {/* Import Excel Modal */}
      <AdminModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title={t('importExcel')}
        size="lg"
      >
        <div className="space-y-5 pt-2">
          {/* Download template link */}
          <a
            href="/api/menu-import"
            download
            className="inline-flex items-center gap-2 text-sm font-medium text-lime-700 hover:text-lime-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('downloadTemplate')}
          </a>

          {/* File upload drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all',
              isDragOver
                ? 'border-lime-400 bg-lime-50'
                : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-neutral-100',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
            <div className="w-12 h-12 bg-white rounded-xl border border-neutral-100 flex items-center justify-center">
              <Upload className="w-5 h-5 text-neutral-400" />
            </div>
            {importFile ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-neutral-900">{importFile.name}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{formatFileSize(importFile.size)}</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-neutral-600">{t('dragAndDrop')}</p>
                <p className="text-xs text-neutral-400 mt-1">{t('maxFileSize')}</p>
              </div>
            )}
          </div>

          {/* Import results */}
          {importResult && (
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 space-y-2">
              {importResult.categoriesCreated > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  {t('categoriesCreated', { count: importResult.categoriesCreated })}
                </div>
              )}
              {importResult.itemsCreated > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  {t('itemsCreated', { count: importResult.itemsCreated })}
                </div>
              )}
              {importResult.itemsSkipped > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {t('itemsSkipped', { count: importResult.itemsSkipped })}
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {t('errorsFound', { count: importResult.errors.length })}
                  </div>
                  <ul className="ml-6 space-y-0.5">
                    {importResult.errors.map((err, i) => (
                      <li key={i} className="text-xs text-red-600">
                        {t('rowError', { row: err.row, message: err.message })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
            <Button type="button" variant="ghost" onClick={() => setShowImportModal(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="lime"
              disabled={!importFile || importing}
              onClick={handleImport}
              className="gap-2 rounded-xl"
            >
              {importing && <Loader2 className="w-4 h-4 animate-spin" />}
              {importing ? t('importing') : t('importExcel')}
            </Button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

// ─── Menu Card Component ──────────────────────────────────

interface MenuCardProps {
  menu: Menu;
  tenantSlug: string;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onAddChild: () => void;
  onReorder: (from: number, to: number) => void;
}

function MenuCard({ menu, tenantSlug, onEdit, onDelete, onToggle, onAddChild }: MenuCardProps) {
  const t = useTranslations('menus');
  return (
    <div className="bg-white rounded-xl border border-neutral-100 hover:border-neutral-200 transition-all group">
      <div className="flex items-center gap-4 p-4">
        <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Folder className="w-5 h-5 text-neutral-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/sites/${tenantSlug}/admin/menus/${menu.id}`}
              className="font-semibold text-neutral-900 text-sm hover:underline truncate"
            >
              {menu.name}
            </Link>
            {menu.name_en && (
              <span className="text-xs text-neutral-400 truncate">({menu.name_en})</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {menu.venue && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Building2 className="w-2.5 h-2.5" />
                {menu.venue.name}
              </Badge>
            )}
            {menu.children && menu.children.length > 0 && (
              <span className="text-xs text-neutral-400">
                {t('subMenuCount', { count: menu.children.length })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className={cn(
              'px-2 py-1 rounded-full text-xs font-semibold border transition-all',
              menu.is_active
                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                : 'bg-neutral-100 text-neutral-500 border-neutral-200',
            )}
          >
            {menu.is_active ? (
              <>
                <ToggleRight className="w-3 h-3 inline mr-0.5" /> {t('active')}
              </>
            ) : (
              <>
                <ToggleLeft className="w-3 h-3 inline mr-0.5" /> {t('inactive')}
              </>
            )}
          </button>

          <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddChild}
              title={t('addSubMenu')}
              className="h-8 w-8 p-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 w-8 p-0">
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Link href={`/sites/${tenantSlug}/admin/menus/${menu.id}`}>
            <ChevronRight className="w-4 h-4 text-neutral-400" />
          </Link>
        </div>
      </div>

      {/* Sub-menus (children) */}
      {menu.children && menu.children.length > 0 && (
        <div className="border-t border-neutral-50 px-4 py-2 bg-neutral-50/50">
          <div className="flex flex-wrap gap-2">
            {menu.children.map((child) => (
              <span
                key={child.id}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border',
                  child.is_active
                    ? 'bg-white text-neutral-700 border-neutral-200'
                    : 'bg-neutral-100 text-neutral-400 border-neutral-200',
                )}
              >
                {child.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
