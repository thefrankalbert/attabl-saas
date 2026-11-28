'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ItemModifier } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import {
  actionCreateModifier,
  actionDeleteModifier,
  actionToggleModifierAvailable,
} from '@/app/actions/modifiers';

interface ItemModifierEditorProps {
  tenantId: string;
  menuItemId: string;
  menuItemName: string;
  modifiers: ItemModifier[];
  onUpdate: () => void;
  onClose: () => void;
}

export default function ItemModifierEditor({
  tenantId,
  menuItemId,
  menuItemName,
  modifiers: initialModifiers,
  onUpdate,
  onClose,
}: ItemModifierEditorProps) {
  const [modifiers, setModifiers] = useState<ItemModifier[]>(initialModifiers);
  const [newName, setNewName] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { toast } = useToast();
  const t = useTranslations('modifiers');
  const tc = useTranslations('common');
  // Meme regle que le serveur et que la base (`garder_prix_carte`): creer ou
  // supprimer un supplement PAYANT, c'est toucher a un prix (`menu.price`).
  const canPrice = usePermissions().can('menu.price');
  const isPriced = (mod: ItemModifier) => mod.price > 0 || mod.prices != null;
  /** Un refus de droit dit pourquoi ; une panne reste "erreur". */
  const refusalMessage = (code: 'forbidden' | undefined, priced: boolean): string =>
    code === 'forbidden' ? t(priced ? 'needsPriceRight' : 'needsEditRight') : tc('error');

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;

    const price = parseFloat(newPrice) || 0;
    if (price < 0) {
      toast({ title: t('priceNegative'), variant: 'destructive' });
      return;
    }
    // Sans le droit de prix, un supplement payant serait refuse par le serveur:
    // on le dit tout de suite, sans aller-retour.
    if (price > 0 && !canPrice) {
      toast({ title: t('needsPriceRight'), variant: 'destructive' });
      return;
    }
    setSaving(true);

    const result = await actionCreateModifier(tenantId, {
      tenant_id: tenantId,
      menu_item_id: menuItemId,
      name,
      name_en: newNameEn.trim() || null,
      price,
      is_available: true,
      display_order: modifiers.length,
    });

    setSaving(false);

    if (result.error) {
      toast({ title: refusalMessage(result.code, price > 0), variant: 'destructive' });
      return;
    }
    setModifiers((prev) => [...prev, result.data as ItemModifier]);
    setNewName('');
    setNewNameEn('');
    setNewPrice('');
    onUpdate();
    toast({ title: t('added') });
  };

  const handleDelete = async (mod: ItemModifier) => {
    setDeletingId(mod.id);
    const result = await actionDeleteModifier(tenantId, mod.id);
    setDeletingId(null);
    if (result.error) {
      toast({ title: refusalMessage(result.code, isPriced(mod)), variant: 'destructive' });
      return;
    }
    setModifiers((prev) => prev.filter((m) => m.id !== mod.id));
    onUpdate();
    toast({ title: t('deleted') });
  };

  const handleToggleAvailable = async (mod: ItemModifier) => {
    const result = await actionToggleModifierAvailable(tenantId, mod.id, !mod.is_available);
    if (result.error) {
      toast({ title: refusalMessage(result.code, false), variant: 'destructive' });
      return;
    }
    setModifiers((prev) =>
      prev.map((m) => (m.id === mod.id ? { ...m, is_available: !m.is_available } : m)),
    );
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-text-secondary">{t('editingFor', { item: menuItemName })}</p>

      {/* Existing modifiers */}
      {modifiers.length > 0 ? (
        <div className="space-y-1.5">
          {modifiers.map((mod) => (
            <div key={mod.id} className="flex items-center gap-2 p-2.5 bg-app-bg rounded-lg group">
              <GripVertical className="w-3.5 h-3.5 text-app-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-app-text">{mod.name}</span>
                {mod.name_en && (
                  <span className="text-xs text-app-text-muted ml-1.5">({mod.name_en})</span>
                )}
              </div>
              <span className="text-sm font-bold text-app-text tabular-nums shrink-0">
                +{mod.price} FCFA
              </span>
              <Button
                variant="outline"
                onClick={() => handleToggleAvailable(mod)}
                className={cn(
                  'px-2 py-0.5 rounded-[0.625rem] text-[10px] font-medium shrink-0 h-auto',
                  mod.is_available
                    ? 'border border-[var(--border)] text-[var(--success)]'
                    : 'bg-app-elevated text-app-text-secondary border-app-border',
                )}
              >
                {mod.is_available ? t('available') : t('unavailable')}
              </Button>
              {/* Supprimer un supplement payant exige `menu.price`: sans ce
                  droit le bouton n'est pas propose (il finirait en refus). */}
              {(canPrice || !isPriced(mod)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(mod)}
                  disabled={deletingId === mod.id}
                  title={tc('delete')}
                  className="h-8 w-8 p-0 text-app-text-muted hover:text-[var(--destructive)] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {deletingId === mod.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-app-text-muted italic py-3">{t('empty')}</p>
      )}

      {/* Add new modifier */}
      <div className="border-t border-app-border pt-4">
        <p className="text-xs font-semibold text-app-text mb-2">{t('addNew')}</p>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('namePlaceholder')}
            aria-label={t('namePlaceholder')}
            className="flex-1 text-base md:text-sm"
          />
          <Input
            value={newNameEn}
            onChange={(e) => setNewNameEn(e.target.value)}
            placeholder={t('nameEnPlaceholder')}
            aria-label={t('nameEnPlaceholder')}
            className="flex-1 text-base md:text-sm"
          />
          <Input
            type="number"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder={t('pricePlaceholder')}
            aria-label={t('pricePlaceholder')}
            className="w-24 text-base md:text-sm"
            min={0}
          />
          <Button
            onClick={handleAdd}
            disabled={saving || !newName.trim()}
            size="sm"
            aria-label={t('addNew')}
            title={t('addNew')}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-app-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          {tc('close')}
        </Button>
      </div>
    </div>
  );
}
