// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';
import type { OnboardingData } from '@/app/onboarding/page';

/**
 * Contre-audit 4: l'ecran de lancement ne dit pas "Tout est pret !" quand une
 * zone en doublon bloquera le lancement, et le point des tables le nomme.
 */
vi.mock('@/components/qr/LaunchQR', () => ({ LaunchQR: () => null }));
vi.mock('../launch/LaunchMenuUrl', () => ({ LaunchMenuUrl: () => null }));
vi.mock('../launch/LaunchDashboardNote', () => ({ LaunchDashboardNote: () => null }));

import { LaunchStep } from '../LaunchStep';

const zone = (name: string, prefix: string) => ({ name, prefix, tableCount: 4 });

function renderLaunch(tableZones: OnboardingData['tableZones']) {
  render(
    <NextIntlClientProvider locale="fr-FR" messages={fr}>
      <LaunchStep
        variant="summary"
        updateData={vi.fn()}
        data={
          {
            establishmentType: 'restaurant',
            tableConfigMode: 'complete',
            tableZones,
            primaryColor: '#4d7c0f',
            menuOption: 'skip',
            tenantName: 'Chez Awa',
            tenantSlug: 'chez-awa',
            qrTemplate: 'minimal',
            qrStyle: 'branded',
          } as OnboardingData
        }
      />
    </NextIntlClientProvider>,
  );
}

describe('LaunchStep: zone en doublon', () => {
  it('titre et point des tables disent qu il reste a corriger', () => {
    renderLaunch([zone('Salle', 'VIP'), zone('Bar', 'VIP')]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      fr.onboarding.launchTitleBlocked,
    );
    expect(screen.getByText(fr.onboarding.checkTablesToFix)).toBeInTheDocument();
  });

  it('temoin: sans doublon, "Tout est pret !" et "Tables configurees"', () => {
    renderLaunch([zone('Salle', 'SAL'), zone('Bar', 'BAR')]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(fr.onboarding.launchTitle);
    expect(screen.getByText(fr.onboarding.checkTablesConfigured)).toBeInTheDocument();
  });
});
