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

  useEffect(() => {
    if (isOpen) {
      // Use setTimeout to batch setState outside the effect synchronously
      setTimeout(() => {
        setQuery('');
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Normalize text: lowercase + strip accents (e.g. "Taginé" -> "tagine", "Café" -> "cafe")
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = normalize(query);
    return items.filter(
      (item) =>
        normalize(item.name).includes(q) ||
        normalize(item.name_en || '').includes(q) ||
        normalize(item.description || '').includes(q) ||
        normalize(item.description_en || '').includes(q),
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
              className="p-2 rounded-full hover:bg-app-elevated transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-app-elevated rounded-xl px-3 py-2.5">
              <Search className="w-4 h-4 text-app-text-muted" />
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
                  <X className="w-4 h-4 text-app-text-muted" />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 py-4 pb-28 space-y-3">
            {query && results.length === 0 && (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-app-text-muted mx-auto mb-3" />
                <p className="text-sm text-app-text-secondary">{t('noSearchResults', { query })}</p>
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
