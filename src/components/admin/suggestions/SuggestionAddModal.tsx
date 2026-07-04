'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import AdminModal from '@/components/admin/AdminModal';
import type { SuggestionType } from '@/types/inventory.types';
import type { MenuItem, SuggestionTypeConfig } from './types';

interface SuggestionAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  suggestionTypes: SuggestionTypeConfig[];
  sourceItemId: string;
  onSourceChange: (value: string) => void;
  targetItemId: string;
  onTargetChange: (value: string) => void;
  suggestionType: SuggestionType;
  onTypeChange: (value: SuggestionType) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
}

export default function SuggestionAddModal({
  isOpen,
  onClose,
  menuItems,
  suggestionTypes,
  sourceItemId,
  onSourceChange,
  targetItemId,
  onTargetChange,
  suggestionType,
  onTypeChange,
  description,
  onDescriptionChange,
  onSubmit,
}: SuggestionAddModalProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');

  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title={t('newSuggestion')} size="lg">
      <div className="space-y-4 pt-4">
        <div>
          <Label className="text-sm font-medium text-app-text mb-1.5 block">
            {t('sourceDish')}
          </Label>
          <Select value={sourceItemId || undefined} onValueChange={onSourceChange}>
            <SelectTrigger className="w-full h-10">
              <SelectValue placeholder={tc('selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {menuItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium text-app-text mb-1.5 block">
            {t('suggestionType')}
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {suggestionTypes.map((st) => (
              <Button
                key={st.value}
                type="button"
                variant="outline"
                onClick={() => onTypeChange(st.value)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 h-auto rounded-lg border text-xs font-medium transition-all',
                  suggestionType === st.value
                    ? 'border-accent bg-accent-muted text-app-text'
                    : 'border-app-border text-app-text-secondary hover:bg-app-bg',
                )}
              >
                <span>{st.emoji}</span>
                <span>{st.label}</span>
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-app-text mb-1.5 block">
            {t('suggestedDish')}
          </Label>
          <Select value={targetItemId || undefined} onValueChange={onTargetChange}>
            <SelectTrigger className="w-full h-10">
              <SelectValue placeholder={tc('selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {menuItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium text-app-text mb-1.5 block">
            {t('serverAdvice')}
          </Label>
          <Input
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder={t('serverAdvicePlaceholder')}
            className="rounded-lg focus-visible:ring-1 focus-visible:ring-accent/30"
          />
          <p className="mt-1 text-xs text-app-text-secondary">{t('addServerAdvice')}</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={onClose}>
          {tc('cancel')}
        </Button>
        <Button onClick={onSubmit} variant="default">
          {tc('add')}
        </Button>
      </div>
    </AdminModal>
  );
}
