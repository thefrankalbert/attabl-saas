// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { FrozenBanner } from '../FrozenBanner';

// Fin d'essai (decision produit du 2026-11-09): le restaurateur doit savoir
// combien de jours sa carte reste visible aux convives. Tout autre gel garde le
// message d'origine, sans compte a rebours.

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count !== undefined ? `${key}:${values.count}` : key,
}));

describe('FrozenBanner', () => {
  it('fin d essai: donne les jours de carte visible restants', () => {
    render(<FrozenBanner tenantSlug="resto" menuDaysLeft={5} />);
    expect(screen.getByText('menuVisibleDaysLeft:5')).toBeInTheDocument();
    expect(screen.queryByText('expired')).toBeNull();
  });

  it('le message passe a la ligne au lieu d etre coupe sur telephone', () => {
    render(<FrozenBanner tenantSlug="resto" menuDaysLeft={7} />);
    expect(screen.getByText('menuVisibleDaysLeft:7')).not.toHaveClass('truncate');
  });

  it('autre gel: message d origine, pas de compte a rebours', () => {
    render(<FrozenBanner tenantSlug="resto" />);
    expect(screen.getByText('expired')).toBeInTheDocument();
    expect(screen.queryByText(/menuVisibleDaysLeft/)).toBeNull();
  });
});
