'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowLeft } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { MenuItem } from '@/types/admin.types';
import MenuItemCard from './MenuItemCard';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  items: MenuItem[];
  restaurantId: string;
  currency?: string;
  onOpenDetail: (item: MenuItem) => void;
}

export default function SearchOverlay({
  isOpen,
  onClose,
  items,
  restaurantId,
  currency,
  onOpenDetail,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('tenant');
  const locale = useLocale();
  const language = locale.startsWith('en') ? 'en' : 'fr';

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.name_en?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.description_en?.toLowerCase().includes(q),
    );
  }, [query, items]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed inset-0 z-[55] bg-app-bg flex flex-col"
        >
          {/* Search header */}
          <div className="sticky top-0 z-10 bg-app-card border-b border-app-border/50 px-4 py-3 flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-neutral-100 rounded-xl px-3 py-2.5">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchMenu')}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')} className="p-0.5">
                  <X className="w-4 h-4 text-neutral-400" />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 py-4 pb-28 space-y-3">
            {query && results.length === 0 && (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-neutral-200 mx-auto mb-3" />
                <p className="text-sm text-neutral-500">{t('noSearchResults', { query })}</p>
              </div>
            )}
            {results.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                restaurantId={restaurantId}
                currency={currency}
                language={language}
                onOpenDetail={() => onOpenDetail(item)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
