'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Venue, Menu } from '@/types/admin.types';

interface MenuSelectionSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filteredMenus: Menu[];
  hideMenuTabsRow: boolean;
  activeMenuSlug: string | null;
  onMenuChange: (slug: string) => void;
  venues: Venue[];
  hideVenueRow: boolean;
  activeVenueId: string | null;
  onSelectVenue: (id: string | null) => void;
  onCloseSheet: () => void;
}

export default function MenuSelectionSheet({
  isOpen,
  onOpenChange,
  filteredMenus,
  hideMenuTabsRow,
  activeMenuSlug,
  onMenuChange,
  venues,
  hideVenueRow,
  activeVenueId,
  onSelectVenue,
  onCloseSheet,
}: MenuSelectionSheetProps) {
  const t = useTranslations('tenant');

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>{t('sheetMenuTitle')}</SheetTitle>
        </SheetHeader>
        {filteredMenus.length > 1 && !hideMenuTabsRow && (
          <div className="mb-4">
            <p className="text-[11px] font-medium text-[#B0B0B0] uppercase tracking-[1px] mb-2">
              {t('sheetMenuSection')}
            </p>
            <div className="flex flex-col gap-1">
              {filteredMenus.map((menu) => (
                <Button
                  key={menu.slug}
                  variant="ghost"
                  onClick={() => {
                    onMenuChange(menu.slug);
                    onCloseSheet();
                  }}
                  className={cn(
                    'justify-between h-11 px-3 rounded-xl',
                    activeMenuSlug === menu.slug
                      ? 'bg-[#F6F6F6] font-semibold text-[#1A1A1A]'
                      : 'text-[#737373]',
                  )}
                >
                  <span className="truncate">{menu.name}</span>
                  {activeMenuSlug === menu.slug && <Check className="w-4 h-4 flex-shrink-0" />}
                </Button>
              ))}
            </div>
          </div>
        )}
        {venues.length > 1 && !hideVenueRow && (
          <div>
            <p className="text-[11px] font-medium text-[#B0B0B0] uppercase tracking-[1px] mb-2">
              {t('sheetVenueSection')}
            </p>
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                onClick={() => {
                  onSelectVenue(null);
                  onCloseSheet();
                }}
                className={cn(
                  'justify-between h-11 px-3 rounded-xl',
                  !activeVenueId ? 'bg-[#F6F6F6] font-semibold text-[#1A1A1A]' : 'text-[#737373]',
                )}
              >
                {t('allFilter')}
                {!activeVenueId && <Check className="w-4 h-4" />}
              </Button>
              {venues.map((venue) => (
                <Button
                  key={venue.id}
                  variant="ghost"
                  onClick={() => {
                    onSelectVenue(venue.id);
                    onCloseSheet();
                  }}
                  className={cn(
                    'justify-between h-11 px-3 rounded-xl',
                    activeVenueId === venue.id
                      ? 'bg-[#F6F6F6] font-semibold text-[#1A1A1A]'
                      : 'text-[#737373]',
                  )}
                >
                  <span className="truncate">{venue.name}</span>
                  {activeVenueId === venue.id && <Check className="w-4 h-4 flex-shrink-0" />}
                </Button>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
