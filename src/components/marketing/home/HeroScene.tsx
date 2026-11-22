'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { startSceneMotion } from './motion/scene-motion';

/**
 * Piste et scene collante du hero et du champ de tuiles. La mise en page vient
 * du CSS des le rendu serveur ; ce composant ne pose que le mouvement.
 */
export function HeroScene({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trackRef.current) return startSceneMotion(trackRef.current);
  }, []);

  return (
    <div ref={trackRef} data-piste className="home-piste">
      <div data-scene className="home-scene bg-white dark:bg-zinc-950">
        {children}
      </div>
    </div>
  );
}
