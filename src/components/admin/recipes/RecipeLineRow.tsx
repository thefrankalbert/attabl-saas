'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { Ingredient } from '@/types/inventory.types';
import { INGREDIENT_UNITS } from '@/types/inventory.types';
import type { RecipeLine } from './types';

interface RecipeLineRowProps {
  line: RecipeLine;
  ingredients: Ingredient[];
  recipeLines: RecipeLine[];
  usedIngredientIds: Set<string>;
  canEdit: boolean;
  onUpdateLine: (lineId: string, field: string, value: string | number | '') => void;
  onRemoveLine: (lineId: string) => void;
}

export default function RecipeLineRow({
  line,
  ingredients,
  recipeLines,
  usedIngredientIds,
  canEdit,
  onUpdateLine,
  onRemoveLine,
}: RecipeLineRowProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const { toast } = useToast();

  const availableIngredients = ingredients.filter(
    (ing) => ing.id === line.ingredient_id || !usedIngredientIds.has(ing.id),
  );
  // A recipe can reference an ingredient that was deactivated
  // since (the active-only list no longer contains it). Without
  // a matching item the Select trigger renders blank.
  const lineIngredientKnown = ingredients.some((ing) => ing.id === line.ingredient_id);
  const lineUnitShort =
    INGREDIENT_UNITS[line.unit as keyof typeof INGREDIENT_UNITS]?.labelShort || line.unit;

  return (
    <div className="flex items-start gap-2 p-3 bg-app-bg rounded-lg border border-app-border">
      <div className="flex-1 space-y-2">
        <Select
          value={line.ingredient_id}
          onValueChange={(val) => {
            const alreadyUsed = recipeLines.some(
              (l) => l.lineId !== line.lineId && l.ingredient_id === val,
            );
            if (alreadyUsed) {
              toast({
                title: t('recipeDuplicateIngredient'),
                variant: 'destructive',
              });
              return;
            }
            onUpdateLine(line.lineId, 'ingredient_id', val);
          }}
          disabled={!canEdit}
        >
          <SelectTrigger className="w-full h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!lineIngredientKnown && line.ingredient_id && (
              <SelectItem value={line.ingredient_id}>
                {line.ingredient_name}
                {lineUnitShort ? ` (${lineUnitShort})` : ''}
              </SelectItem>
            )}
            {availableIngredients.map((ing) => (
              <SelectItem key={ing.id} value={ing.id}>
                {ing.name} ({INGREDIENT_UNITS[ing.unit]?.labelShort})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            type="number"
            step="0.001"
            min="0"
            placeholder={t('qtyPlaceholder')}
            value={line.quantity_needed === 0 ? '' : line.quantity_needed}
            onChange={(e) =>
              onUpdateLine(
                line.lineId,
                'quantity_needed',
                e.target.value === '' ? '' : parseFloat(e.target.value),
              )
            }
            disabled={!canEdit}
            className="h-8 text-sm flex-1"
          />
          <span className="text-xs text-app-text-secondary self-center w-10">{lineUnitShort}</span>
        </div>
        <Textarea
          placeholder={t('notesOptional')}
          value={line.notes}
          onChange={(e) => onUpdateLine(line.lineId, 'notes', e.target.value)}
          disabled={!canEdit}
          rows={2}
          className="text-sm min-h-0 resize-none"
        />
      </div>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={tc('delete')}
          onClick={() => onRemoveLine(line.lineId)}
          className="p-1.5 h-auto w-auto text-status-error hover:text-status-error hover:bg-status-error-bg rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
