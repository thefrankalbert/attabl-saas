'use client';

import { useState, useCallback } from 'react';
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
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
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
  const [menus, setMenus] = useState<Menu[]>(initialMenus);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
  const supabase = createClient();

  const loadMenus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('menus')
        .select(
          '*, venue:venues(id, name, slug), children:menus!parent_menu_id(id, name, name_en, slug, is_active, display_order)',
        )
        .eq('tenant_id', tenantId)
        .is('parent_menu_id', null)
        .order('display_order', { ascending: true });
      if (data) setMenus(data as Menu[]);
    } catch {
      toast({ title: 'Erreur lors du chargement', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId, toast]);

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
        toast({ title: 'Carte mise à jour' });
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
        toast({ title: 'Carte créée' });
      }
      setShowModal(false);
      loadMenus();
    } catch {
      toast({ title: 'Erreur lors de la sauvegarde', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (menu: Menu) => {
    if (!confirm(`Supprimer la carte "${menu.name}" ? Cette action est irréversible.`)) return;

    try {
      const result = await actionDeleteMenu(tenantId, menu.id);
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Carte supprimée' });
      loadMenus();
    } catch {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
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
      toast({ title: 'Erreur', variant: 'destructive' });
    }
  };

  const handleReorder = async (dragIndex: number, dropIndex: number) => {
    const reordered = [...menus];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setMenus(reordered);

    const orderedIds = reordered.map((m) => m.id);
    await actionReorderMenus(tenantId, orderedIds);
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
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Cartes / Menus</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Gérez vos cartes, sous-cartes et leur contenu
          </p>
        </div>
        <Button onClick={() => openNewMenuModal()} disabled={limitReached} className="gap-2">
          <Plus className="w-4 h-4" />
          Nouvelle carte
        </Button>
      </div>

      {/* Limit warning */}
      {limitReached && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800 font-medium">
            Vous avez atteint la limite de {limits.maxMenus} cartes pour votre plan.{' '}
            <Link href={`/sites/${tenantSlug}/admin/subscription`} className="underline font-bold">
              Passer au Premium →
            </Link>
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <Input
          placeholder="Rechercher une carte..."
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
            Cartes indépendantes
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
                {venue?.name || 'Espace'}
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
          <h3 className="text-base font-bold text-neutral-900">Aucune carte</h3>
          <p className="text-sm text-neutral-500 mt-2">
            Créez votre première carte pour organiser vos plats
          </p>
          <Button onClick={() => openNewMenuModal()} className="mt-4">
            Créer une carte
          </Button>
        </div>
      )}

      {/* Create/Edit Modal */}
      <AdminModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingMenu ? 'Modifier la carte' : 'Nouvelle carte'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="menu-name">Nom (FR) *</Label>
              <Input
                id="menu-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Carte des Boissons"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menu-name-en">Nom (EN)</Label>
              <Input
                id="menu-name-en"
                value={formNameEn}
                onChange={(e) => setFormNameEn(e.target.value)}
                placeholder="Ex: Drinks Menu"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="menu-desc">Description (FR)</Label>
              <Input
                id="menu-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Description de la carte"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menu-desc-en">Description (EN)</Label>
              <Input
                id="menu-desc-en"
                value={formDescriptionEn}
                onChange={(e) => setFormDescriptionEn(e.target.value)}
                placeholder="Menu description"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="menu-venue">Espace (optionnel)</Label>
              <select
                id="menu-venue"
                value={formVenueId || ''}
                onChange={(e) => setFormVenueId(e.target.value || null)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
              >
                <option value="">Aucun (carte indépendante)</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="menu-parent">Carte parente (sous-carte)</Label>
              <select
                id="menu-parent"
                value={formParentMenuId || ''}
                onChange={(e) => setFormParentMenuId(e.target.value || null)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
              >
                <option value="">Aucune (carte principale)</option>
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
              className="rounded border-neutral-300"
            />
            <Label htmlFor="menu-active">Carte active (visible aux clients)</Label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingMenu ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
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
                {menu.children.length} sous-carte{menu.children.length > 1 ? 's' : ''}
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
                <ToggleRight className="w-3 h-3 inline mr-0.5" /> Active
              </>
            ) : (
              <>
                <ToggleLeft className="w-3 h-3 inline mr-0.5" /> Inactive
              </>
            )}
          </button>

          <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddChild}
              title="Ajouter une sous-carte"
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
