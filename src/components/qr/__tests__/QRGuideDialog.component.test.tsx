// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { QRGuideDialog } from '../QRGuideDialog';

const KEY = 'attabl:qr-guide-seen:demo';

function renderGuide() {
  return render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <QRGuideDialog tenantSlug="demo" />
    </NextIntlClientProvider>,
  );
}

describe('tutoriel de la page QR', () => {
  beforeEach(() => window.localStorage.clear());

  it("s'ouvre a la premiere visite et propose de suivre ou de passer", async () => {
    renderGuide();
    expect(await screen.findByText('Vos QR codes en 4 étapes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suivre le guide' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passer' })).toBeInTheDocument();
  });

  it('"Passer" ferme le guide et ne le rouvre plus tout seul', async () => {
    const first = renderGuide();
    fireEvent.click(await screen.findByRole('button', { name: 'Passer' }));
    expect(window.localStorage.getItem(KEY)).toBe('1');
    first.unmount();

    renderGuide();
    expect(screen.queryByText('Vos QR codes en 4 étapes')).not.toBeInTheDocument();
  });

  it('montre une etape par ecran, dans l ordre, jusqu a "Terminer"', async () => {
    renderGuide();
    fireEvent.click(await screen.findByRole('button', { name: 'Suivre le guide' }));
    expect(screen.getByText('Étape 1 sur 4')).toBeInTheDocument();
    expect(screen.getByText('Choisir la table et la carte')).toBeInTheDocument();
    for (let i = 2; i <= 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
      expect(screen.getByText(`Étape ${i} sur 4`)).toBeInTheDocument();
    }
    expect(screen.getByText('Sur chaque table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(screen.getByText('Étape 3 sur 4')).toBeInTheDocument();
  });

  it('le bouton Guide rouvre le tutoriel a la premiere etape', async () => {
    window.localStorage.setItem(KEY, '1');
    renderGuide();
    expect(screen.queryByText('Étape 1 sur 4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guide' }));
    expect(await screen.findByText('Étape 1 sur 4')).toBeInTheDocument();
  });
});
