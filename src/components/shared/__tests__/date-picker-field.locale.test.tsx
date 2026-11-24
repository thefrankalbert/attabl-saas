// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Verification visuelle du lot B2b-2 (defaut 4): next-intl renvoie "fr-FR" et
// "en-US", la table de locales du selecteur n'avait que "fr" et "en". La date
// s'affichait donc toujours en anglais ("December 31st, 2026") dans une
// interface en francais (formulaire de coupon, annonces).

let currentLocale = 'fr-FR';
vi.mock('next-intl', () => ({ useLocale: () => currentLocale }));

import { DatePickerField } from '@/components/ui/date-picker-field';

afterEach(() => cleanup());

function labelFor(locale: string): string {
  currentLocale = locale;
  render(<DatePickerField value="2026-12-31" onChange={vi.fn()} />);
  return screen.getByRole('button').textContent ?? '';
}

describe('DatePickerField: la date suit la langue de l interface', () => {
  it('fr-FR: format francais', () => {
    expect(labelFor('fr-FR')).toMatch(/31 d.cembre 2026/);
  });

  it('en-US: format anglais', () => {
    expect(labelFor('en-US')).toContain('December 31st, 2026');
  });

  it('locale inconnue: retombe sur l anglais', () => {
    expect(labelFor('de-DE')).toContain('December 31st, 2026');
  });
});
