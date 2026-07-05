'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { OrderItem, ItemStatus } from '@/types/admin.types';
import KDSTicketItem from './KDSTicketItem';
import { COURSE_ORDER, COURSE_LABEL_KEY } from './kds-ticket.config';

interface KDSTicketItemsListProps {
  orderId: string;
  items: OrderItem[];
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  hasCourses: boolean;
  isMock: boolean;
  onUpdateItemStatus?: (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    allItems: { id: string; item_status?: string }[],
  ) => Promise<void>;
  onSetCourseHeld?: (orderId: string, course: string, held: boolean) => Promise<void>;
}

export default function KDSTicketItemsList({
  orderId,
  items,
  expanded,
  setExpanded,
  hasCourses,
  isMock,
  onUpdateItemStatus,
  onSetCourseHeld,
}: KDSTicketItemsListProps) {
  const t = useTranslations('kitchen');

  const renderItem = (item: OrderItem) => (
    <KDSTicketItem
      key={item.id}
      item={item}
      orderId={orderId}
      expanded={expanded}
      items={items}
      onUpdateItemStatus={onUpdateItemStatus}
    />
  );

  return (
    <div
      className={cn(
        'flex-1 min-h-0 px-3 py-2 space-y-1',
        expanded ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden',
      )}
      onClick={() => !expanded && items.length > 4 && setExpanded(true)}
      role={!expanded && items.length > 4 ? 'button' : undefined}
    >
      {hasCourses && expanded
        ? [...COURSE_ORDER, '__none__'].map((course) => {
            const groupItems = items.filter((i) => (i.course || '__none__') === course);
            if (groupItems.length === 0) return null;
            const groupHeld = groupItems.every((i) => i.held);
            const canFireHold = !!onSetCourseHeld && course !== '__none__' && !isMock;
            return (
              <div key={course} className="space-y-1">
                {course !== '__none__' && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                      {t(COURSE_LABEL_KEY[course])}
                    </p>
                    {canFireHold && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetCourseHeld?.(orderId, course, !groupHeld);
                        }}
                        className="h-auto min-h-[44px] px-2 py-1 text-xs font-semibold text-accent hover:underline"
                      >
                        {groupHeld ? t('fireCourse') : t('holdCourse')}
                      </Button>
                    )}
                  </div>
                )}
                {groupItems.map(renderItem)}
              </div>
            );
          })
        : (expanded ? items : items.slice(0, 4)).map(renderItem)}

      {!expanded && items.length > 4 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded(true)}
          className="w-full text-center py-1 text-xs font-medium text-accent hover:underline h-auto"
        >
          +{items.length - 4} {t('moreItems')}
        </Button>
      )}
      {expanded && items.length > 4 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded(false)}
          className="w-full text-center py-1 text-xs font-medium text-app-text-muted hover:underline h-auto"
        >
          {t('showLess')}
        </Button>
      )}
    </div>
  );
}
