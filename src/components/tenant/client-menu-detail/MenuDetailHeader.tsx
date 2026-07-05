'use client';

import { useTranslations } from 'next-intl';
import { Search, ChevronLeft, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MenuDetailHeaderProps {
  tenantName: string;
  headerSubtitle: string;
  canSwitchMenu: boolean;
  showSearch: boolean;
  searchQuery: string;
  onBack: () => void;
  onOpenMenuSheet: () => void;
  onToggleSearch: () => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
}

export default function MenuDetailHeader({
  tenantName,
  headerSubtitle,
  canSwitchMenu,
  showSearch,
  searchQuery,
  onBack,
  onOpenMenuSheet,
  onToggleSearch,
  onSearchChange,
  onClearSearch,
}: MenuDetailHeaderProps) {
  const t = useTranslations('tenant');

  const headerTitleInner = (
    <>
      <h1 className="text-[16px] font-semibold leading-[1.15] tracking-[-0.4px] text-[#1A1A1A] truncate">
        {t('menuTitle')} {tenantName}
      </h1>
      {headerSubtitle && (
        <div className="mt-px flex items-center gap-1 text-[11.5px] text-[#737373]">
          <MapPin className="w-[11px] h-[11px] flex-shrink-0" strokeWidth={2} />
          <span className="truncate">{headerSubtitle}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-[#EEEEEE]">
      {/* Row 1: back + title/subtitle + search toggle */}
      <div className="px-[14px] py-3 flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="w-[38px] h-[38px] rounded-full bg-app-elevated flex-shrink-0"
          aria-label={t('ariaGoBack')}
        >
          <ChevronLeft className="w-5 h-5 text-[#1A1A1A]" />
        </Button>
        {canSwitchMenu ? (
          <Button
            variant="ghost"
            onClick={onOpenMenuSheet}
            aria-haspopup="dialog"
            aria-label={t('sheetMenuTitle')}
            className="flex h-auto min-w-0 flex-1 flex-col items-start gap-0 p-0 text-left hover:bg-transparent"
          >
            {headerTitleInner}
          </Button>
        ) : (
          <div className="min-w-0 flex-1">{headerTitleInner}</div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSearch}
          className="w-[38px] h-[38px] rounded-full flex-shrink-0"
          aria-label={t('searchMenu')}
        >
          {showSearch ? (
            <X className="w-5 h-5 text-[#1A1A1A]" />
          ) : (
            <Search className="w-5 h-5 text-[#1A1A1A]" />
          )}
        </Button>
      </div>
      {/* Row 2: search input (toggled by the header icon) */}
      {showSearch && (
        <div className="px-3 pb-2">
          <div className="flex h-10 items-center gap-2.5 rounded-[var(--radius-search)] border border-[#EEEEEE] bg-[#F6F6F6] px-3">
            <Search className="w-[17px] h-[17px] flex-shrink-0 text-[#737373]" strokeWidth={2} />
            <Input
              autoFocus
              type="text"
              placeholder={t('searchMenu')}
              className="h-auto flex-1 border-0 bg-transparent p-0 text-[14px] font-medium shadow-none focus-visible:ring-0 text-[#1A1A1A]"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClearSearch}
                aria-label={t('clearSearch')}
                className="w-[18px] h-[18px] shrink-0 rounded-full bg-[#1A1A1A] p-0 hover:bg-[#1A1A1A]"
              >
                <X className="w-[11px] h-[11px] text-white" strokeWidth={2.6} />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
