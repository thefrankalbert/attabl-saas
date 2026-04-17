'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface Category {
  id: string;
  name: string;
}

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  rootMargin: '-140px 0px -60% 0px',
  threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0],
};

/** Offset used for scrolling (sticky search header + sticky category nav) */
const SCROLL_OFFSET = 112;

interface CategoryNavProps {
  categories: Category[];
  /** Optional map of category id to item count */
  itemCounts?: Record<string, number>;
  /** Top offset (px) where the nav becomes sticky - below search bar */
  topOffset?: number;
}

export default function CategoryNav({ categories, topOffset = 0 }: CategoryNavProps) {
  const [activeCategory, setActiveCategory] = React.useState<string>('');
  const navRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const buttonRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

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
    const element = document.getElementById(`cat-${id}`);
    if (element) {
      const elementRect = element.getBoundingClientRect();
      const absoluteElementTop = elementRect.top + window.scrollY;
      const offsetPosition = absoluteElementTop - SCROLL_OFFSET;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  if (categories.length === 0) return null;

  return (
    <div
      ref={navRef}
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
          gap: '8px',
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
              className="active:scale-[0.98] h-auto px-4 py-2"
              style={{
                flexShrink: 0,
                whiteSpace: 'nowrap',
                borderRadius: '24px',
                fontSize: '11px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                lineHeight: 1.4,
                backgroundColor: isActive ? '#1A1A1A' : '#F6F6F6',
                color: isActive ? '#FFFFFF' : '#737373',
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
