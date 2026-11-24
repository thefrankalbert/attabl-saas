// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';
import type { OnboardingData } from '@/app/onboarding/page';
import { CompleteZones } from '../tables/CompleteZones';
import { LaunchMenuUrl } from '../launch/LaunchMenuUrl';
import { PhonePreview } from '../PhonePreview';
import { OnboardingTopNav } from '../OnboardingTopNav';
import type { PhaseDefinition } from '../onboarding-steps';
import { Palette } from 'lucide-react';

/**
 * Contre-audit 5 (verification visuelle, axe-core): chaque champ de zone a son
 * etiquette, le lien a icone seule a un nom, l'apercu telephone decoratif est
 * masque aux lecteurs d'ecran.
 */
function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr-FR" messages={fr}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('accessibilite de l onboarding', () => {
  it('mode complet: nom, prefixe et nombre de tables relies a leur etiquette', () => {
    wrap(
      <CompleteZones
        zones={[{ name: 'Salle', prefix: 'SAL', tableCount: 4, defaultCapacity: 2 }]}
        issues={[]}
        updateZone={vi.fn()}
        addZone={vi.fn()}
        removeZone={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(fr.onboarding.zoneTableCount)).toHaveValue(4);
    expect(screen.getByLabelText(fr.onboarding.zoneName)).toHaveValue('Salle');
    expect(screen.getByLabelText(fr.onboarding.zonePrefix)).toHaveValue('SAL');
  });

  it('le lien qui ouvre le menu a un nom accessible traduit', () => {
    wrap(<LaunchMenuUrl menuUrl="https://chez-awa.attabl.com" accentColor="#000" />);
    expect(screen.getByRole('link', { name: fr.onboarding.openMenuUrl })).toHaveAttribute(
      'href',
      'https://chez-awa.attabl.com',
    );
  });

  it('l apercu telephone est decoratif (aria-hidden)', () => {
    const { container } = wrap(
      <PhonePreview
        phase={1}
        data={
          { tenantName: 'Chez Awa', menuItems: [], currency: 'XOF' } as unknown as OnboardingData
        }
      />,
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('en-tete: boutons d etape et lien du logo nommes, meme quand le libelle est cache sur telephone', () => {
    const phases: PhaseDefinition[] = [
      { labelKey: 'phaseIdentity', icon: Palette, subScreens: ['establishment'] },
      { labelKey: 'phaseMenu', icon: Palette, subScreens: ['menu'] },
    ];
    render(
      <OnboardingTopNav
        phases={phases}
        phase={1}
        tenantName="Chez Awa"
        autoSaveStatus="idle"
        t={(key: string) => `t:${key}`}
        phaseIsComplete={() => false}
        goToPhase={vi.fn()}
      />,
    );
    // Le libelle visible est cache sous 640 px (`hidden sm:inline`) ; happy-dom
    // n'applique pas ce CSS, donc on exige le nom porte par aria-label.
    const phaseLabels = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
      .filter((label) => label?.startsWith('t:phase'));
    expect(phaseLabels).toEqual(['t:phaseIdentity', 't:phaseMenu']);
    const home = screen.getByRole('link', { name: 't:home' });
    expect(home).toHaveAttribute('aria-label', 't:home');
    expect(home).toHaveAttribute('href', '/');
  });
});
