// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeAdsStrip } from '../HomeAdsStrip';

const IMG = 'https://nqufpobuozrzwpeijkxt.supabase.co/storage/v1/object/public/images/t/a.jpg';

describe('HomeAdsStrip', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://nqufpobuozrzwpeijkxt.supabase.co';
  });

  it('ne rend rien sans annonce', () => {
    const { container } = render(<HomeAdsStrip ads={[]} label="Offres" openLabel="Ouvrir" />);
    expect(container.innerHTML).toBe('');
  });

  it('rend un lien https qui ouvre un nouvel onglet', () => {
    render(
      <HomeAdsStrip
        ads={[{ id: '1', image_url: IMG, link: 'https://exemple.com' }]}
        label="Offres"
        openLabel="Ouvrir"
      />,
    );
    const lien = screen.getByRole('link');
    expect(lien.getAttribute('href')).toBe('https://exemple.com');
    expect(lien.getAttribute('rel')).toContain('noopener');
  });

  it("n'emet jamais un lien javascript:", () => {
    render(
      <HomeAdsStrip
        ads={[{ id: '1', image_url: IMG, link: 'javascript:alert(1)' }]}
        label="Offres"
        openLabel="Ouvrir"
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('ignore une image hors de notre stockage', () => {
    const { container } = render(
      <HomeAdsStrip
        ads={[{ id: '1', image_url: 'https://ailleurs.example/a.jpg', link: null }]}
        label="Offres"
        openLabel="Ouvrir"
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});
