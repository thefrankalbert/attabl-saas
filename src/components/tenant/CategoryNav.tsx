'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
}

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  rootMargin: '-80px 0px -70% 0px',
  threshold: [0, 0.1, 0.3, 0.5, 0.7, 1.0],
};

interface CategoryNavProps {
  categories: Category[];
}

export default function CategoryNav({ categories }: CategoryNavProps) {
  const [activeCategory, setActiveCategory] = React.useState<string>('');
  const [tabPaneHeight, setTabPaneHeight] = React.useState<number>(60);
  const navRef = React.useRef<HTMLDivElement>(null);
  const buttonRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  // Détecter la hauteur du tab pane s'il existe
  React.useEffect(() => {
    const checkTabPane = () => {
      const tabPane = document.querySelector('[data-tab-pane]');
      if (tabPane) {
        setTabPaneHeight(tabPane.getBoundingClientRect().height);
      } else {
        setTabPaneHeight(0);
      }
    };
    checkTabPane();
    window.addEventListener('resize', checkTabPane);
    return () => window.removeEventListener('resize', checkTabPane);
  }, []);

  // Sync horizontal scroll when active category changes
  React.useEffect(() => {
    if (activeCategory && buttonRefs.current.has(activeCategory)) {
      const activeButton = buttonRefs.current.get(activeCategory);
      if (activeButton && navRef.current) {
        // Centrer l'item actif dans la navigation horizontale
        const container = navRef.current;
        const buttonLeft = activeButton.offsetLeft;
        const buttonWidth = activeButton.offsetWidth;
        const containerWidth = container.offsetWidth;

        // Calculer la position pour centrer le bouton
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
      // Trouver l'entrée avec le meilleur ratio d'intersection
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
      // Calculer l'offset en tenant compte de la hauteur du tab pane et de la navigation
      const navHeight = navRef.current?.offsetHeight || 60;
      const offset = tabPaneHeight + navHeight + 20; // 20px d'espace supplémentaire

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
      className="fixed left-0 right-0 z-30 bg-white/80 backdrop-blur-xl border-b border-neutral-100 overflow-x-auto scrollbar-hide py-3 transition-all duration-150"
      style={{ top: `${tabPaneHeight}px` }}
    >
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 flex gap-2">
        {categories.map((category) => (
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
            className={cn(
              'relative px-4 py-2 text-sm font-medium whitespace-nowrap rounded-full transition-colors active:scale-[0.98]',
              activeCategory !== category.id && 'bg-neutral-100 hover:bg-neutral-200',
            )}
          >
            {activeCategory === category.id && (
              <motion.div
                layoutId="activeCategoryPill"
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: 'var(--tenant-primary)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span
              className={cn(
                'relative z-10',
                activeCategory === category.id ? 'text-white' : 'text-neutral-600',
              )}
            >
              {category.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
