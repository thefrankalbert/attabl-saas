'use client';

import { useEffect, useState, useCallback } from 'react';
import { Lightbulb, Plus, Trash2, Search, Wand2, CheckSquare, Square, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import AdminModal from '@/components/admin/AdminModal';
import type { SuggestionType } from '@/types/inventory.types';
import { generateAndSaveSuggestions } from '@/services/suggestion.service';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

interface SuggestionsClientProps {
  tenantId: string;
  subscriptionPlan?: SubscriptionPlan | null;
  subscriptionStatus?: SubscriptionStatus | null;
  trialEndsAt?: string | null;
}

interface MenuItem {
  id: string;
  name: string;
}

interface Suggestion {
  id: string;
  menu_item_id: string;
  suggested_item_id: string;
  suggestion_type: SuggestionType;
  description: string | null;
  display_order: number;
  is_active: boolean;
  // Joined
  menu_item?: { name: string };
  suggested_item?: { name: string };
}

export default function SuggestionsClient({
  tenantId,
  subscriptionPlan,
  subscriptionStatus,
  trialEndsAt,
}: SuggestionsClientProps) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [sourceItemId, setSourceItemId] = useState('');
  const [targetItemId, setTargetItemId] = useState('');
  const [suggestionType, setSuggestionType] = useState<SuggestionType>('pairing');
  const [description, setDescription] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const supabase = createClient();
  const [generating, setGenerating] = useState(false);
  const canAutoGenerate = canAccessFeature(
    'autoSuggestions',
    subscriptionPlan,
    subscriptionStatus,
    trialEndsAt,
  );

  const SUGGESTION_TYPES: { value: SuggestionType; label: string; emoji: string; color: string }[] =
    [
      {
        value: 'pairing',
        label: t('pairing'),
        emoji: '\uD83C\uDF77',
        color: 'bg-purple-500/10 text-purple-500',
      },
      {
        value: 'upsell',
        label: t('upsell'),
        emoji: '\uD83D\uDCA1',
        color: 'bg-amber-500/10 text-amber-500',
      },
      {
        value: 'alternative',
        label: t('alternativeItem'),
        emoji: '\uD83D\uDD04',
        color: 'bg-blue-500/10 text-blue-500',
      },
    ];

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, suggestionsRes] = await Promise.all([
        supabase
          .from('menu_items')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('is_available', true)
          .order('name'),
        supabase
          .from('item_suggestions')
          .select(
            '*, menu_item:menu_items!item_suggestions_menu_item_id_fkey(name), suggested_item:menu_items!item_suggestions_suggested_item_id_fkey(name)',
          )
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('display_order'),
      ]);

      if (itemsRes.data) setMenuItems(itemsRes.data as MenuItem[]);
      if (suggestionsRes.data) setSuggestions(suggestionsRes.data as Suggestion[]);
    } catch {
      toast({ title: tc('loadingError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async () => {
    if (!sourceItemId || !targetItemId) {
      toast({ title: t('selectBothDishes'), variant: 'destructive' });
      return;
    }
    if (sourceItemId === targetItemId) {
      toast({ title: t('dishesMustDiffer'), variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase.from('item_suggestions').insert({
        tenant_id: tenantId,
        menu_item_id: sourceItemId,
        suggested_item_id: targetItemId,
        suggestion_type: suggestionType,
        description: description.trim() || null,
        display_order: suggestions.length,
      });

      if (error) throw error;
      toast({ title: t('suggestionAdded') });
      setShowAdd(false);
      setSourceItemId('');
      setTargetItemId('');
      setDescription('');
      loadData();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('item_suggestions')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      toast({ title: t('suggestionDeleted') });
      loadData();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const handleAutoGenerate = async () => {
    setGenerating(true);
    try {
      const count = await generateAndSaveSuggestions(supabase, tenantId);
      toast({ title: t('suggestionsGenerated', { count }) });
      loadData();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const { error } = await supabase
        .from('item_suggestions')
        .update({ is_active: false })
        .in('id', Array.from(selectedIds));

      if (error) throw error;
      toast({ title: t('suggestionsDeleted', { count: selectedIds.size }) });
      setSelectedIds(new Set());
      loadData();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const filtered = suggestions.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.menu_item?.name.toLowerCase().includes(q) ||
      s.suggested_item?.name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-app-text-secondary">
          {tc('loading')}
        </div>
      ) : (
        <>
          {/* Header + Search + Bulk actions */}
          <div className="shrink-0 flex flex-col lg:flex-row lg:items-center gap-3">
            <span className="text-sm text-app-text-muted tabular-nums">({suggestions.length})</span>

            <div className="relative w-full lg:w-56 xl:w-64 shrink-0">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
              <Input
                placeholder={t('searchDish')}
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Bulk actions */}
            {suggestions.length > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleSelectAll}>
                  {selectedIds.size === filtered.length && filtered.length > 0 ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  {selectedIds.size === filtered.length && filtered.length > 0
                    ? t('deselectAll')
                    : t('selectAll')}
                </Button>
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleBulkDelete}
                  >
                    <XCircle className="w-4 h-4" />
                    {t('deleteSelected', { count: selectedIds.size })}
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 lg:ml-auto shrink-0">
              {canAutoGenerate && (
                <Button
                  onClick={handleAutoGenerate}
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9"
                  disabled={generating || menuItems.length === 0}
                >
                  <Wand2 className="w-4 h-4" />
                  {generating ? tc('loading') : t('autoGenerate')}
                </Button>
              )}
              <Button
                onClick={() => setShowAdd(true)}
                variant="default"
                size="sm"
                className="gap-2 h-9"
              >
                <Plus className="w-4 h-4" />
                {t('addSuggestion')}
              </Button>
            </div>
          </div>

          {/* Suggestions List */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-2 sm:mt-4">
            {filtered.length > 0 ? (
              <div className="bg-app-card rounded-xl border border-app-border overflow-hidden">
                {filtered.map((suggestion) => {
                  const typeConfig = SUGGESTION_TYPES.find(
                    (st) => st.value === suggestion.suggestion_type,
                  );
                  return (
                    <div
                      key={suggestion.id}
                      className={cn(
                        'flex items-center gap-4 px-4 py-3 border-b border-app-border hover:bg-app-bg/50 transition-colors group',
                        selectedIds.has(suggestion.id) && 'bg-accent/5',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSelect(suggestion.id)}
                        className="text-app-text-muted hover:text-app-text-secondary transition-colors shrink-0"
                      >
                        {selectedIds.has(suggestion.id) ? (
                          <CheckSquare className="w-4 h-4 text-lime-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0',
                          typeConfig?.color || 'bg-app-bg text-app-text-secondary',
                        )}
                      >
                        {typeConfig?.emoji} {typeConfig?.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-app-text break-words">
                          <span className="font-medium">
                            {suggestion.menu_item?.name || tc('unknown')}
                          </span>
                          <span className="text-app-text-muted mx-2">→</span>
                          <span className="font-medium text-primary">
                            {suggestion.suggested_item?.name || tc('unknown')}
                          </span>
                        </p>
                        {suggestion.description && (
                          <p className="text-xs text-app-text-muted break-words mt-0.5 italic">
                            {suggestion.description}
                          </p>
                        )}
                      </div>
                      <div className="lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                          onClick={() => handleDelete(suggestion.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-app-card rounded-xl border border-app-border p-16 text-center">
                <div className="w-16 h-16 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Lightbulb className="w-8 h-8 text-app-text-muted" />
                </div>
                <p className="text-lg font-bold text-app-text">{t('noSuggestions')}</p>
                <p className="text-sm text-app-text-secondary mt-2">{t('addServerAdvice')}</p>
              </div>
            )}
          </div>

          {/* Add Modal */}
          <AdminModal
            isOpen={showAdd}
            onClose={() => setShowAdd(false)}
            title={t('newSuggestion')}
            size="lg"
          >
            <div className="space-y-4 pt-4">
              <div>
                <Label className="text-sm font-medium text-app-text mb-1.5 block">
                  {t('sourceDish')}
                </Label>
                <select
                  value={sourceItemId}
                  onChange={(e) => setSourceItemId(e.target.value)}
                  className="w-full h-10 px-3 border border-app-border rounded-lg text-sm bg-app-card text-app-text focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                >
                  <option value="">{tc('selectPlaceholder')}</option>
                  {menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-sm font-medium text-app-text mb-1.5 block">
                  {t('suggestionType')}
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {SUGGESTION_TYPES.map((st) => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => setSuggestionType(st.value)}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all',
                        suggestionType === st.value
                          ? 'border-accent bg-accent-muted text-app-text'
                          : 'border-app-border text-app-text-secondary hover:bg-app-bg',
                      )}
                    >
                      <span>{st.emoji}</span>
                      <span>{st.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-app-text mb-1.5 block">
                  {t('suggestedDish')}
                </Label>
                <select
                  value={targetItemId}
                  onChange={(e) => setTargetItemId(e.target.value)}
                  className="w-full h-10 px-3 border border-app-border rounded-lg text-sm bg-app-card text-app-text focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                >
                  <option value="">{tc('selectPlaceholder')}</option>
                  {menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-sm font-medium text-app-text mb-1.5 block">
                  {t('serverAdvice')}
                </Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('serverAdvicePlaceholder')}
                  className="rounded-lg focus-visible:ring-accent"
                />
                <p className="mt-1 text-xs text-app-text-secondary">{t('addServerAdvice')}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => setShowAdd(false)}>
                {tc('cancel')}
              </Button>
              <Button onClick={handleAdd} variant="default">
                {tc('add')}
              </Button>
            </div>
          </AdminModal>
        </>
      )}
    </div>
  );
}
