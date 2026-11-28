// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';
import { AddRestaurantWizard } from '../AddRestaurantWizard';

// Audit d'equipe du 2026-11-27 (onboarding #25): l'assistant etait un `div`
// fait main, sans role de dialogue, sans Echap ni piege du focus.

function wrap(onClose = vi.fn()): ReturnType<typeof vi.fn> {
  render(
    <NextIntlClientProvider locale="fr-FR" messages={fr}>
      <AddRestaurantWizard onClose={onClose} onSuccess={vi.fn()} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe('AddRestaurantWizard: vraie fenetre de dialogue', () => {
  it('expose role="dialog" et un titre (Radix rend le reste de la page inerte)', () => {
    wrap();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(fr.admin.addRestaurant.title);
  });

  it('se ferme avec Echap', () => {
    const onClose = wrap();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
