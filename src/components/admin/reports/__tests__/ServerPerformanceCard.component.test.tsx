// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { ServerPerformanceCard } from '../ServerPerformanceCard';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

/**
 * Mesure du 2026-11-21 sur un build local a 375 px: le tableau des serveurs
 * faisait 387 px dans une carte de 291 px (deja 301 px avant la colonne des
 * pourboires), et a 1024 px 387 px dans 383 (deux cartes cote a cote). Sous
 * `sm` et entre `lg` et `xl`, panier moyen et pourboires passent sous le nom.
 */
describe('ServerPerformanceCard - pourboires sur telephone', () => {
  afterEach(cleanup);

  it('montre les pourboires sous le nom sur telephone, et en colonne a partir de sm', () => {
    render(
      <NextIntlClientProvider locale="fr-FR" messages={messages}>
        <ServerPerformanceCard
          fmt={(v) => `${v} FCFA`}
          serverStats={[
            { serverName: 'Awa', orders: 2, revenue: 22500, avgOrder: 11250, tips: 2500 },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Pourboires : 2500 FCFA')).toHaveClass(
      'sm:hidden',
      'lg:block',
      'xl:hidden',
    );
    expect(screen.getByRole('columnheader', { name: 'Pourboires' })).toHaveClass(
      'hidden',
      'sm:table-cell',
      'lg:hidden',
      'xl:table-cell',
    );
  });
});
