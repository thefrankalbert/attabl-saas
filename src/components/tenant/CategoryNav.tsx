'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { activeCategoryAt, stickyAnchorBottom } from '@/components/tenant/category-scroll-spy';

interface Category {
  id: string;
  name: string;
}

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

  // Identite stable de la liste des categories: le parent reconstruit son
  // tableau a chaque rendu, ce qui relancerait l'effet du scroll-spy sans fin.
  const categoryIds = categories.map((category) => category.id).join('|');

  // Scroll-spy positionnel: la categorie active est celle qui occupe le haut de
  // la zone de lecture (voir `activeCategoryAt`). L'ancien observer choisissait
  // la section dont la plus grande part tombait dans une bande, ce qui laissait
  // le titre en retard d'une categorie entiere, et ne se redeclenchait qu'au
  // franchissement d'un seuil de ratio, ce qui le figeait entre deux.
  React.useEffect(() => {
    const scroller = document.getElementById('main-content');
    if (!scroller) return;

    const ids = categoryIds.split('|');

    // Recalcul direct, sans report a l'image suivante: un recalcul reporte peut
    // etre annule par le demontage de l'effet (il se relance a chaque rendu du
    // parent), et l'evenement de defilement qui l'avait demande ne revient pas.
    // Mesure du 2026-11-05: le titre accusait alors jusqu'a 200px de retard. Le
    // calcul se resume a une lecture de position par categorie.
    const recompute = () => {
      // Ne pas contrarier un defilement declenche par une pastille: le clic a
      // deja fixe la categorie, et les re-alignements successifs passeraient
      // par les sections intermediaires.
      if (programmaticScrollRef.current) return;

      const tops = ids
        .map((id) => {
          const element = document.getElementById(`cat-${id}`);
          return element ? { id, top: element.getBoundingClientRect().top } : null;
        })
        .filter((entry): entry is { id: string; top: number } => entry !== null);

      // Ligne mesuree, pas supposee: la pile collante gagne une rangee
      // d'onglets quand la carte a des sous-cartes (169 -> 223px).
      const next = activeCategoryAt(tops, stickyAnchorBottom());
      if (next) setActiveCategory((current) => (current === next ? current : next));
    };

    recompute();
    scroller.addEventListener('scroll', recompute, { passive: true });

    // Les images des plats se chargent apres coup et decalent les sections sans
    // qu'un seul evenement de defilement ne soit emis: sans cela, le titre
    // resterait sur une position perimee.
    const resizeObserver = new ResizeObserver(recompute);
    ids.forEach((id) => {
      const element = document.getElementById(`cat-${id}`);
      if (element) resizeObserver.observe(element);
    });

    return () => {
      scroller.removeEventListener('scroll', recompute);
      resizeObserver.disconnect();
    };
    // `categoryIds` plutot que `categories`: le parent recree ce tableau a
    // chaque rendu, donc dependre de son identite relancait l'effet en boucle.
  }, [categoryIds]);

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    programmaticScrollRef.current = true;
    // The scroll container is <main id="main-content"> (html/body are
    // overflow:hidden). Native `scrollIntoView`/`scrollTo` with `behavior:
    // 'smooth'` is unreliable here (a silent no-op in some engines), so we set
    // scrollTop directly. La cible est le bas MESURE de la pile collante
    // (`stickyAnchorBottom`), la meme ligne que le scroll-spy: sinon un clic
    // sur une pastille atterrirait juste au-dessus et reactiverait la categorie
    // precedente. La pile n'a pas de hauteur fixe - une carte a sous-cartes
    // ajoute une rangee d'onglets.
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
      const delta = element.getBoundingClientRect().top - stickyAnchorBottom();
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
