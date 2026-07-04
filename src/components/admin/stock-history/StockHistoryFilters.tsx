import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MovementType } from '@/types/inventory.types';

interface StockHistoryFiltersProps {
  filters: { value: MovementType | 'all'; label: string }[];
  filterType: MovementType | 'all';
  onSelect: (value: MovementType | 'all') => void;
}

export default function StockHistoryFilters({
  filters,
  filterType,
  onSelect,
}: StockHistoryFiltersProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
      {filters.map((f) => {
        const isActive = filterType === f.value;
        return (
          <Button
            key={f.value}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelect(f.value)}
            className={cn(
              'inline-flex items-center px-3 py-1.5 h-auto text-xs rounded-lg whitespace-nowrap transition-colors border',
              isActive
                ? 'bg-app-text text-app-bg border-app-text font-semibold'
                : 'bg-app-card text-app-text-secondary border-app-border/50 font-medium hover:border-app-border hover:bg-app-elevated hover:text-app-text',
            )}
          >
            {f.label}
          </Button>
        );
      })}
    </div>
  );
}
