'use client';

import React from 'react';

interface Category {
  id: string;
  name: string;
}

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  rootMargin: '-80px 0px -70% 0px',
  threshold: [0, 0.1, 0.3, 0.5, 0.7, 1.0],
};

/** Height of the sticky search header in ClientMenuPage */
const STICKY_HEADER_HEIGHT = 56;

interface CategoryNavProps {
  categories: Category[];
  /** Show the sticky nav (e.g. when user has scrolled past the hero) */
  visible?: boolean;
}

export default function CategoryNav({ categories, visible = true }: CategoryNavProps) {
  const [activeCategory, setActiveCategory] = React.useState<string>('');
  const navRef = React.useRef<HTMLDivElement>(null);
  const buttonRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  // Sync horizontal scroll when active category changes
  React.useEffect(() => {
    if (activeCategory && buttonRefs.current.has(activeCategory)) {
      const activeButton = buttonRefs.current.get(activeCategory);
      if (activeButton && navRef.current) {
        const container = navRef.current;
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

  React.useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      let bestEntry = entries[0];
      let bestRatio = 0;

      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
          bestRatio = entry.intersectionRatio;
          bestEntry = entry;
        }
      });

      if (bestEntry && bestEntry.isIntersecting) {
        const id = bestEntry.target.id.replace('cat-', '');
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
      const navHeight = navRef.current?.offsetHeight || 48;
      const offset = STICKY_HEADER_HEIGHT + navHeight + 16;

      const elementRect = element.getBoundingClientRect();
      const absoluteElementTop = elementRect.top + window.scrollY;
      const offsetPosition = absoluteElementTop - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div
      ref={navRef}
      className="scrollbar-hide"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        zIndex: 30,
        backgroundColor: 'var(--app-card)',
        borderBottom: '1px solid var(--app-border)',
        overflowX: 'auto',
        padding: '12px 0',
        top: `${STICKY_HEADER_HEIGHT}px`,
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'transform 0.2s ease, opacity 0.2s ease',
      }}
    >
      <div
        style={{
          maxWidth: '768px',
          margin: '0 auto',
          padding: '0 12px',
          display: 'flex',
          gap: '8px',
          minWidth: 'max-content',
        }}
      >
        {categories.map((category) => {
          const isActive = activeCategory === category.id;
          return (
            <button
              key={category.id}
              ref={(el) => {
                if (el) {
                  buttonRefs.current.set(category.id, el);
                } else {
                  buttonRefs.current.delete(category.id);
                }
              }}
              onClick={() => scrollToCategory(category.id)}
              className="whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 border active:scale-[0.98]"
              style={{
                whiteSpace: 'nowrap',
                padding: '8px 16px',
                borderRadius: '9999px',
                fontSize: '14px',
                fontWeight: 500,
                border: isActive ? '1px solid var(--tenant-primary)' : '1px solid transparent',
                cursor: 'pointer',
                backgroundColor: isActive ? 'var(--tenant-primary)' : 'var(--app-elevated)',
                color: isActive ? '#ffffff' : 'var(--app-text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {category.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
