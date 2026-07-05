'use client';

import { useTranslations } from 'next-intl';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import { MenuItem } from '@/types/admin.types';

interface MenuItemsListProps {
  categories: { id: string; name: string; name_en?: string; items: MenuItem[] }[];
  disabledItemIds: Set<string>;
  restaurantId: string;
  currency?: string;
  lang: 'fr' | 'en';
  onOpenDetail: (item: MenuItem) => void;
}

export default function MenuItemsList({
  categories,
  disabledItemIds,
  restaurantId,
  currency,
  lang,
  onOpenDetail,
}: MenuItemsListProps) {
  const t = useTranslations('tenant');

  if (categories.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="rounded-xl p-6 sm:p-8 max-w-sm mx-auto bg-white border border-[#EEEEEE]">
          <p className="font-medium text-[#B0B0B0]">{t('noMenuAvailable')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {categories.map(
        (category, catIndex) =>
          category.items.length > 0 && (
            <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-[170px]">
              {/* Items list */}
              <div className="bg-white pt-3 px-4">
                <div>
                  {category.items.map((item: MenuItem, index: number) => {
                    const isRealtimeDisabled = disabledItemIds.has(item.id);
                    const effectiveItem = isRealtimeDisabled
                      ? { ...item, is_available: false }
                      : item;
                    return (
                      <MenuItemCard
                        key={item.id}
                        item={effectiveItem}
                        restaurantId={restaurantId}
                        priority={index < 4 && catIndex === 0}
                        category={category.name}
                        language={lang as 'fr' | 'en'}
                        currency={currency}
                        onOpenDetail={() => onOpenDetail(effectiveItem)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Spacer between sections */}
              {catIndex < categories.length - 1 && <div className="h-5 bg-white" />}
            </section>
          ),
      )}
    </div>
  );
}
