// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';
import type { OnboardingData } from '@/app/onboarding/page';
import { TablesStep } from '../TablesStep';

/**
 * Contre-audit 3: un doublon de prefixe se voit DES l'etape des tables, sous
 * le champ de la zone concernee, et non au bouton de lancement.
 */
function renderStep(zones: OnboardingData['tableZones'], mode: OnboardingData['tableConfigMode']) {
  const updateData = vi.fn();
  render(
    <NextIntlClientProvider locale="fr-FR" messages={fr}>
      <TablesStep
        data={{ tableConfigMode: mode, tableZones: zones } as OnboardingData}
        updateData={updateData}
      />
    </NextIntlClientProvider>,
  );
  return updateData;
}

const zone = (name: string, prefix: string) => ({
  name,
  prefix,
  prefixManual: true,
  tableCount: 4,
  defaultCapacity: 2,
});

describe('TablesStep: doublons signales a l etape des tables', () => {
  it('mode complet, VIP et VIP: message sous le prefixe de la seconde zone', () => {
    renderStep([zone('Salle', 'VIP'), zone('Bar', 'VIP')], 'complete');
    const message = screen.getByText('Une autre zone a déjà ce préfixe.');
    expect(message).toHaveAttribute('id', 'zone-1-prefix-issue');
  });

  it('temoin: des prefixes distincts n affichent aucun message', () => {
    renderStep([zone('Salle', 'VIP'), zone('Bar', 'BAR')], 'complete');
    expect(screen.queryByText('Une autre zone a déjà ce préfixe.')).not.toBeInTheDocument();
  });
});

describe('TablesStep: aller-retour par le mode rapide (contre-audit 4)', () => {
  const modeButton = (key: 'modeComplete' | 'modeMinimum') =>
    screen.getByRole('button', {
      name: (accessibleName) => accessibleName.includes(fr.onboarding[key]),
    });

  it('complet -> rapide -> complet retrouve le prefixe VIP saisi', () => {
    const updateData = renderStep([zone('Terrasse', 'VIP')], 'complete');
    expect(screen.getByDisplayValue('VIP')).toBeInTheDocument();

    fireEvent.click(modeButton('modeMinimum'));
    // Le brouillon envoye en mode rapide recalcule le prefixe depuis le nom...
    const quickDraft = updateData.mock.calls.at(-1)?.[0] as Partial<OnboardingData>;
    expect(quickDraft.tableZones?.map((z) => z.prefix)).toEqual(['TER']);
    // ... et l'apercu montre ce prefixe-la.
    expect(screen.getByText('TER-1')).toBeInTheDocument();

    fireEvent.click(modeButton('modeComplete'));
    expect(screen.getByDisplayValue('VIP')).toBeInTheDocument();
    const backDraft = updateData.mock.calls.at(-1)?.[0] as Partial<OnboardingData>;
    expect(backDraft.tableZones?.map((z) => z.prefix)).toEqual(['VIP']);
  });
});
