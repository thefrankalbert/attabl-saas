'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, ShoppingBag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LocationRow } from './LocationCard';
import type { LocationStat } from '@/types/command-center.types';

interface LocationsListProps {
  locations: LocationStat[];
  onOpenDashboard: (slug: string) => void;
  onOpenMenu: (slug: string) => void;
  onAdd?: () => void;
}

export function LocationsGrid({
  locations,
  onOpenDashboard,
  onOpenMenu,
  onAdd,
}: LocationsListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return locations;
    const q = query.toLowerCase();
    return locations.filter(
      (l) =>
        l.tenant_name.toLowerCase().includes(q) || l.tenant_slug.toLowerCase().includes(q),
    );
  }, [locations, query]);

  const topTenant = useMemo(() => {
    if (locations.length < 2) return null;
    return locations.reduce(
      (max, l) => (l.revenue_today > max.revenue_today ? l : max),
      locations[0],
    );
  }, [locations]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-app-border px-1 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-app-text-muted">
            Etablissements
          </h2>
          <span className="text-[11px] text-app-text-muted">
            {filtered.length}
            {query && ` / ${locations.length}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-text-muted" />
            <Input
              placeholder="Rechercher..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-40 rounded-lg border-app-border bg-app-elevated pl-8 text-xs sm:w-56"
            />
          </div>
          {onAdd && (
            <Button onClick={onAdd} size="sm" className="h-8 gap-1 rounded-lg px-2.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ajouter</span>
            </Button>
          )}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="min-h-0 flex-1 divide-y divide-app-border overflow-y-auto scrollbar-hide">
          {filtered.map((location) => {
            const isTop =
              topTenant &&
              location.tenant_id === topTenant.tenant_id &&
              location.revenue_today > 0;
            const isWarn = !isTop && !location.is_active;
            return (
              <LocationRow
                key={location.tenant_id}
                location={location}
                rank={isTop ? 'top' : isWarn ? 'warn' : null}
                onOpenDashboard={onOpenDashboard}
                onOpenMenu={onOpenMenu}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <ShoppingBag className="h-6 w-6 text-app-text-muted/40" />
          <h3 className="text-sm font-semibold text-app-text">
            {query ? 'Aucun resultat' : 'Aucun etablissement'}
          </h3>
          <p className="max-w-xs text-xs text-app-text-muted">
            {query
              ? `Aucun etablissement ne correspond a "${query}".`
              : 'Aucun etablissement enregistre.'}
          </p>
          {query && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuery('')}
              className="rounded-lg text-xs"
            >
              Effacer
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
