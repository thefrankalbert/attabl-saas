'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Menu, Venue } from '@/types/admin.types';
import type { MenuFormData } from '@/hooks/useMenusData';

// ─── Types ──────────────────────────────────────────────

interface MenuFormProps {
  editingMenu: Menu | null;
  menus: Menu[];
  venues: Venue[];
  parentMenuId?: string | null;
  onSubmit: (data: MenuFormData) => Promise<void>;
  onCancel: () => void;
}

// ─── Component ──────────────────────────────────────────

export default function MenuForm({
  editingMenu,
  menus,
  venues,
  parentMenuId,
  onSubmit,
  onCancel,
}: MenuFormProps) {
  const t = useTranslations('menus');

  // Form state - initialized from editingMenu or defaults
  const [formName, setFormName] = useState(editingMenu?.name ?? '');
  const [formNameEn, setFormNameEn] = useState(editingMenu?.name_en ?? '');
  const [formDescription, setFormDescription] = useState(editingMenu?.description ?? '');
  const [formDescriptionEn, setFormDescriptionEn] = useState(editingMenu?.description_en ?? '');
  const [formVenueId, setFormVenueId] = useState<string | null>(editingMenu?.venue_id ?? null);
  const [formParentMenuId, setFormParentMenuId] = useState<string | null>(
    editingMenu?.parent_menu_id ?? parentMenuId ?? null,
  );
  const [formIsShared, setFormIsShared] = useState<boolean>(
    editingMenu ? !editingMenu.venue_id : false,
  );
  const [formIsActive, setFormIsActive] = useState(editingMenu?.is_active ?? true);
  const [formIsTransversal, setFormIsTransversal] = useState<boolean>(
    editingMenu?.is_transversal_menu ?? false,
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);

    try {
      await onSubmit({
        name: formName,
        name_en: formNameEn,
        description: formDescription,
        description_en: formDescriptionEn,
        venue_id: formVenueId,
        parent_menu_id: formParentMenuId,
        is_active: formIsActive,
        is_transversal_menu: formIsTransversal,
      });
    } catch {
      // Error already handled by parent via toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="menu-name" className="text-app-text">
            {t('nameFr')}
          </Label>
          <Input
            id="menu-name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder={t('nameFrPlaceholder')}
            className="rounded-lg border border-app-border text-app-text focus-visible:ring-lime-400"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="menu-name-en" className="text-app-text">
            {t('nameEn')}
          </Label>
          <Input
            id="menu-name-en"
            value={formNameEn}
            onChange={(e) => setFormNameEn(e.target.value)}
            placeholder={t('nameEnPlaceholder')}
            className="rounded-lg border border-app-border text-app-text focus-visible:ring-lime-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="menu-desc" className="text-app-text">
            {t('descriptionFr')}
          </Label>
          <Input
            id="menu-desc"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder={t('descriptionFrPlaceholder')}
            className="rounded-lg border border-app-border text-app-text focus-visible:ring-lime-400"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="menu-desc-en" className="text-app-text">
            {t('descriptionEn')}
          </Label>
          <Input
            id="menu-desc-en"
            value={formDescriptionEn}
            onChange={(e) => setFormDescriptionEn(e.target.value)}
            placeholder={t('descriptionEnPlaceholder')}
            className="rounded-lg border border-app-border text-app-text focus-visible:ring-lime-400"
          />
        </div>
      </div>

      {venues.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/15 rounded-lg">
          {/* eslint-disable-next-line react/forbid-elements -- kept as native to preserve existing styling; TODO: migrate to ui/checkbox in a dedicated PR */}
          <input
            type="checkbox"
            id="menu-shared"
            checked={formIsShared}
            onChange={(e) => {
              setFormIsShared(e.target.checked);
              if (e.target.checked) setFormVenueId(null);
            }}
            className="rounded border-app-border text-lime-500 focus:ring-lime-400"
          />
          <Globe className="w-4 h-4 text-lime-600 flex-shrink-0" />
          <div>
            <Label htmlFor="menu-shared" className="text-app-text font-normal">
              {t('sharedMenu')}
            </Label>
            <p className="text-xs text-app-text-secondary mt-0.5">{t('sharedMenuHint')}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`space-y-1.5 ${formIsShared ? 'opacity-50' : ''}`}>
          <Label htmlFor="menu-venue" className="text-app-text">
            {t('spaceOptional')}
          </Label>
          <Select
            value={formVenueId || '__none__'}
            onValueChange={(val) => setFormVenueId(val === '__none__' ? null : val)}
            disabled={formIsShared}
          >
            <SelectTrigger id="menu-venue" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('noSpaceIndependent')}</SelectItem>
              {venues.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="menu-parent" className="text-app-text">
            {t('parentMenu')}
          </Label>
          <Select
            value={formParentMenuId || '__none__'}
            onValueChange={(val) => setFormParentMenuId(val === '__none__' ? null : val)}
          >
            <SelectTrigger id="menu-parent" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('noParentMain')}</SelectItem>
              {menus
                .filter((m) => m.id !== editingMenu?.id)
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line react/forbid-elements -- kept as native to preserve existing styling; TODO: migrate to ui/checkbox in a dedicated PR */}
        <input
          type="checkbox"
          id="menu-active"
          checked={formIsActive}
          onChange={(e) => setFormIsActive(e.target.checked)}
          className="rounded border-app-border text-lime-500 focus:ring-lime-400"
        />
        <Label htmlFor="menu-active" className="text-app-text">
          {t('activeVisibleToClients')}
        </Label>
      </div>

      <div className="flex items-start gap-3 p-3 bg-accent/5 border border-accent/15 rounded-lg">
        <Switch
          id="menu-transversal"
          checked={formIsTransversal}
          onCheckedChange={setFormIsTransversal}
          className="mt-0.5"
        />
        <div>
          <Label htmlFor="menu-transversal" className="text-app-text font-normal">
            {t('transversalMenu')}
          </Label>
          <p className="text-xs text-app-text-secondary mt-0.5">{t('transversalMenuHint')}</p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={saving} variant="default">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {editingMenu ? t('update') : t('create')}
        </Button>
      </div>
    </form>
  );
}
