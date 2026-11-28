// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';
import { AddRestaurantWizard } from '../AddRestaurantWizard';

/**
 * Audit d'equipe du 2026-11-27 (onboarding #24): l'assistant faisait choisir
 * Starter, Pro ou Business avec leur prix, puis le serveur creait un essai.
 * L'assistant ne propose plus de formule: deux etapes, aucun prix affiche, et
 * le corps envoye ne contient plus de `plan`.
 */
function wrap(): void {
  render(
    <NextIntlClientProvider locale="fr-FR" messages={fr}>
      <AddRestaurantWizard onClose={vi.fn()} onSuccess={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

function remplirEtape1(): void {
  fireEvent.change(screen.getByLabelText(fr.admin.addRestaurant.nameLabel), {
    target: { value: 'Chez Fatou' },
  });
  // Le type passe par le Select Radix: on ouvre la liste et on clique l'option.
  fireEvent.click(screen.getByLabelText(fr.admin.addRestaurant.typeLabel));
  fireEvent.click(screen.getByRole('option', { name: fr.admin.addRestaurant.typeRestaurant }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AddRestaurantWizard: pas de formule fictive', () => {
  it('annonce deux etapes et aucun prix de formule', () => {
    wrap();
    expect(screen.getByText('Étape 1 sur 2')).toBeInTheDocument();
    expect(screen.queryByText(/39 000 F/)).not.toBeInTheDocument();
    expect(screen.queryByText(/149 000 F/)).not.toBeInTheDocument();
  });

  it('le recapitulatif dit la verite sur l abonnement et n envoie pas de plan', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ tenantId: 't', slug: 'chez-fatou', trialMode: 'trial' })),
      );
    wrap();
    remplirEtape1();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(fr.admin.addRestaurant.next) }));

    expect(screen.getByText('Étape 2 sur 2')).toBeInTheDocument();
    expect(screen.getByText(fr.admin.addRestaurant.summaryBillingValue)).toBeInTheDocument();
    expect(screen.queryByText(/F \/ mois/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(fr.admin.addRestaurant.create) }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({ name: 'Chez Fatou', type: 'restaurant', slug: 'chez-fatou' });
    expect('plan' in body).toBe(false);
  });
});
