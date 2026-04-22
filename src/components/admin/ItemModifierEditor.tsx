'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ItemModifier } from '@/types/admin.types';
import { createModifierService } from '@/services/modifier.service';

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
  const supabase = createClient();

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;

    const price = parseFloat(newPrice) || 0;
    setSaving(true);

    try {
      const modifierService = createModifierService(supabase);
      const data = await modifierService.createModifier({
        tenant_id: tenantId,
        menu_item_id: menuItemId,
        name,
        name_en: newNameEn.trim() || null,
        price,
        is_available: true,
        display_order: modifiers.length,
      });
      setModifiers((prev) => [...prev, data as ItemModifier]);
      setNewName('');
      setNewNameEn('');
      setNewPrice('');
      onUpdate();
      toast({ title: t('added') });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const modifierService = createModifierService(supabase);
      await modifierService.deleteModifier(id);
      setModifiers((prev) => prev.filter((m) => m.id !== id));
      onUpdate();
      toast({ title: t('deleted') });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleAvailable = async (mod: ItemModifier) => {
    try {
      const modifierService = createModifierService(supabase);
      await modifierService.toggleAvailable(mod.id, !mod.is_available);
      setModifiers((prev) =>
        prev.map((m) => (m.id === mod.id ? { ...m, is_available: !m.is_available } : m)),
      );
      onUpdate();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
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
                <span className="text-sm font-normal text-app-text">{mod.name}</span>
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
                  'px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 h-auto',
                  mod.is_available
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : 'bg-app-elevated text-app-text-secondary border-app-border',
                )}
              >
                {mod.is_available ? t('available') : t('unavailable')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(mod.id)}
                disabled={deletingId === mod.id}
                title="Supprimer"
                className="h-8 w-8 p-0 text-app-text-muted hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {deletingId === mod.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-app-text-muted italic py-3">{t('empty')}</p>
      )}

      {/* Add new modifier */}
      <div className="border-t border-app-border pt-4">
        <p className="text-xs font-bold text-app-text mb-2">{t('addNew')}</p>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('namePlaceholder')}
            className="flex-1 text-sm"
          />
          <Input
            value={newNameEn}
            onChange={(e) => setNewNameEn(e.target.value)}
            placeholder={t('nameEnPlaceholder')}
            className="flex-1 text-sm"
          />
          <Input
            type="number"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder={t('pricePlaceholder')}
            className="w-24 text-sm"
            min={0}
          />
          <Button onClick={handleAdd} disabled={saving || !newName.trim()} size="sm">
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
