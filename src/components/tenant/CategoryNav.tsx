'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface Category {
  id: string;
  name: string;
}

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  rootMargin: '-170px 0px -55% 0px',
  threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0],
};

interface CategoryNavProps {
  categories: Category[];
  /** Top offset (px) where the nav becomes sticky - below search bar */
  topOffset?: number;
  /** Notified whenever the active category changes (click or scroll-spy), so a
   *  parent can render a single sticky title bar in sync with the chips. */
  onActiveChange?: (categoryId: string) => void;
}

export default function CategoryNav({
  categories,
  topOffset = 0,
  onActiveChange,
}: CategoryNavProps) {
  const [activeCategory, setActiveCategory] = React.useState<string>('');

  // Mirror the active category to the parent (single sticky title bar).
  React.useEffect(() => {
    if (activeCategory) onActiveChange?.(activeCategory);
  }, [activeCategory, onActiveChange]);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const buttonRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  // True while a chip-click smooth scroll is in flight: the scroll-spy must not
  // override the clicked category (it would flicker through intermediate
  // sections, and a short last section that bottom-clamps below the active band
  // would never re-highlight). Released on the next genuine user scroll input.
  const programmaticScrollRef = React.useRef(false);
  // Pending corrective-scroll timers (see scrollToCategory).
  const scrollTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearScrollTimers = React.useCallback(() => {
    scrollTimersRef.current.forEach(clearTimeout);
    scrollTimersRef.current = [];
  }, []);

  // Clear pending corrective timers on unmount (no leaked timeouts).
  React.useEffect(() => clearScrollTimers, [clearScrollTimers]);

  // Release the programmatic lock as soon as the user scrolls themselves, so the
  // scroll-spy resumes. Programmatic smooth scroll fires neither wheel nor
  // touchstart, so these signals reliably mean "user took over".
  React.useEffect(() => {
    const scroller = document.getElementById('main-content');
    if (!scroller) return;
    const release = () => {
      programmaticScrollRef.current = false;
      // User took over: cancel any pending corrective re-alignments so we don't
      // yank the scroll back to the tapped category while they are reading.
      clearScrollTimers();
    };
    scroller.addEventListener('wheel', release, { passive: true });
    scroller.addEventListener('touchstart', release, { passive: true });
    return () => {
      scroller.removeEventListener('wheel', release);
      scroller.removeEventListener('touchstart', release);
    };
  }, [clearScrollTimers]);

  // Sync horizontal scroll when active category changes
  React.useEffect(() => {
    if (activeCategory && buttonRefs.current.has(activeCategory)) {
      const activeButton = buttonRefs.current.get(activeCategory);
      const container = scrollerRef.current;
      if (activeButton && container) {
        const buttonLeft = activeButton.offsetLeft;
        const buttonWidth = activeButton.offsetWidth;
        const containerWidth = container.offsetWidth;
        const targetScroll = buttonLeft - containerWidth / 2 + buttonWidth / 2;

        container.scrollTo({
          left: targetScroll,
          behavior: 'smooth',
        });
      }
    }
  }, [activeCategory]);

  // Scroll-spy: observe section headers to highlight active category
  React.useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      // Don't fight a chip-click scroll; the click already set the active chip.
      if (programmaticScrollRef.current) return;

      let bestEntry: IntersectionObserverEntry | null = null;
      let bestRatio = 0;

      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
          bestRatio = entry.intersectionRatio;
          bestEntry = entry;
        }
      });

      if (bestEntry) {
        const id = (bestEntry as IntersectionObserverEntry).target.id.replace('cat-', '');
        setActiveCategory(id);
      }
    }, OBSERVER_OPTIONS);

    categories.forEach((category) => {
      const element = document.getElementById(`cat-${category.id}`);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [categories]);

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    programmaticScrollRef.current = true;
    // The scroll container is <main id="main-content"> (html/body are
    // overflow:hidden). Native `scrollIntoView`/`scrollTo` with `behavior:
    // 'smooth'` is unreliable here (a silent no-op in some engines), so we set
    // scrollTop directly. STICKY_OFFSET = header 63 + CategoryNav 48 + sticky
    // title bar (~58) so the section top lands just under the sticky stack,
    // matching the section's scroll-mt-[170px].
    const STICKY_OFFSET = 169;
    clearScrollTimers();

    // Align the section top with the sticky band by nudging scrollTop by the
    // element's current distance from it. Section anchors sit far down a list of
    // lazily-loaded next/image items, so as images above decode the target's
    // position keeps growing and a single jump undershoots. Re-applying the
    // correction on a few timers (setTimeout keeps firing even when rAF is
    // paused) settles it once the layout stops shifting.
    const alignOnce = () => {
      const scroller = document.getElementById('main-content');
      const element = document.getElementById(`cat-${id}`);
      if (!scroller || !element) return;
      const delta = element.getBoundingClientRect().top - STICKY_OFFSET;
      const maxTop = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = Math.max(0, Math.min(scroller.scrollTop + delta, maxTop));
    };

    alignOnce();
    scrollTimersRef.current = [60, 180, 360, 650, 1000].map((ms) => setTimeout(alignOnce, ms));
  };

  if (categories.length === 0) return null;

  return (
    <div
      className="scrollbar-hide"
      style={{
        position: 'sticky',
        top: `${topOffset}px`,
        zIndex: 30,
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #EEEEEE',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        ref={scrollerRef}
        className="scrollbar-hide"
        style={{
          width: '100%',
          overflowX: 'auto',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '16px',
          paddingRight: '16px',
          gap: '6px',
        }}
      >
        {categories.map((category) => {
          const isActive = activeCategory === category.id;
          return (
            <Button
              key={category.id}
              variant="ghost"
              ref={(el) => {
                if (el) {
                  buttonRefs.current.set(category.id, el);
                } else {
                  buttonRefs.current.delete(category.id);
                }
              }}
              onClick={() => scrollToCategory(category.id)}
              className="h-auto px-[15px] py-2 active:scale-[0.98]"
              style={{
                flexShrink: 0,
                whiteSpace: 'nowrap',
                borderRadius: '24px',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '-0.1px',
                lineHeight: 1.4,
                border: `1px solid ${isActive ? '#1A1A1A' : '#EEEEEE'}`,
                backgroundColor: isActive ? '#1A1A1A' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#404040',
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
            >
              {category.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
