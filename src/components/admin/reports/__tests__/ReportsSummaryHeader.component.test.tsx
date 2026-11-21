// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { ReportsSummaryHeader } from '../ReportsSummaryHeader';

vi.mock('@/components/admin/AdminPageHeader', () => ({ default: () => null }));

/**
 * Contre-audit du lot pourboires (2026-11-21): la ligne disait "Dont
 * pourboires", donc une part du chiffre d'affaires. C'est faux: le chiffre
 * d'affaires suit la date de chaque versement au registre, les pourboires la
 * date ou la commande est soldee. Exemple mesure en pgTAP: 5 500 de chiffre,
 * 800 de pourboires. Le libelle doit dire la base de date, sans "dont".
 */
describe('ReportsSummaryHeader - ligne des pourboires', () => {
  afterEach(cleanup);

  it('dit la base de date et ne presente pas les pourboires comme une part du chiffre', () => {
    render(
      <NextIntlClientProvider locale="fr-FR" messages={messages}>
        <ReportsSummaryHeader
          fmt={(v) => `${v} FCFA`}
          period="today"
          setPeriod={() => {}}
          summary={{ revenue: 5500, orders: 1, avgBasket: 5500, tips: 800 }}
          revenueTrend={0}
          ordersTrend={0}
          basketTrend={0}
          exporting={false}
          exportingCsv={false}
          onExportCSV={() => {}}
          onExportPDF={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText('Pourboires des commandes soldées sur la période : 800 FCFA'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Dont pourboires/)).toBeNull();
  });
});
