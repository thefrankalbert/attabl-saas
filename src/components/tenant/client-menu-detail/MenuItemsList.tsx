'use client';

import { useTranslations } from 'next-intl';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import { MenuItem } from '@/types/admin.types';

interface MenuItemsListProps {
  categories: { id: string; name: string; name_en?: string; items: MenuItem[] }[];
  /** Live availability by item id (from realtime), overriding the server value. */
  availabilityOverride: Map<string, boolean>;
  restaurantId: string;
  currency?: string;
  lang: 'fr' | 'en';
  onOpenDetail: (item: MenuItem) => void;
}

export default function MenuItemsList({
  categories,
  availabilityOverride,
  restaurantId,
  currency,
  lang,
  onOpenDetail,
}: MenuItemsListProps) {
  const t = useTranslations('tenant');

  // Index of the last category that actually renders a section (has items).
  // Its section gets a min-height so it can always scroll up under the sticky
  // header band - otherwise the scroll bottom-clamps and clicking the last
  // category's tab leaves the list where it is (title updates, list stays).
  let lastRenderedIndex = -1;
  categories.forEach((c, i) => {
    if (c.items.length > 0) lastRenderedIndex = i;
  });

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
            <section
              key={category.id}
              id={`cat-${category.id}`}
              className={
                catIndex === lastRenderedIndex
                  ? 'scroll-mt-[170px] min-h-[calc(100dvh-169px)]'
                  : 'scroll-mt-[170px]'
              }
            >
              {/* Items list */}
              <div className="bg-white pt-3 px-4">
                <div>
                  {category.items.map((item: MenuItem, index: number) => {
                    // Live availability wins over the server-rendered value in both
                    // directions (a load-time-unavailable item can flip back live).
                    const liveAvailable = availabilityOverride.get(item.id);
                    const effectiveItem =
                      liveAvailable === undefined || liveAvailable === item.is_available
                        ? item
                        : { ...item, is_available: liveAvailable };
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
