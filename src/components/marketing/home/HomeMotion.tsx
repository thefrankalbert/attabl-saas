'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { startRevealMotion } from './motion/reveal-motion';

/** Mouvement des sections sous la scene. Les textes restent rendus cote serveur. */
export function HomeMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Le changement de langue remplace les mots sans remonter la page.
  const locale = useLocale();

  useEffect(() => {
    if (rootRef.current) return startRevealMotion(rootRef.current);
  }, [locale]);

  return <div ref={rootRef}>{children}</div>;
}
