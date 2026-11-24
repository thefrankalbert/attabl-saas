// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useHomeHeader } from '../useHomeHeader';

// B4: la recherche convive interroge le serveur avec le terme tape, au lieu de
// filtrer un corpus des 150 premiers plats charge une fois.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const zebu = {
  id: 'zebu',
  category_id: 'c1',
  name: 'Zebu grille',
  description: null,
  price: 6000,
  is_available: true,
};

describe('useHomeHeader - recherche serveur', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [zebu] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('envoie le terme au serveur et affiche ses resultats', async () => {
    const { result } = renderHook(() => useHomeHeader({ site: 'resto', popularFull: [] }));

    act(() => result.current.openSearch());
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => result.current.setSearchQuery('zebu'));
    expect(result.current.searchLoading).toBe(true);

    await waitFor(() => expect(result.current.searchResults.map((r) => r.id)).toEqual(['zebu']));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/menu-search?q=zebu');
    expect(result.current.searchLoading).toBe(false);
  });

  it('les resultats deja recus sont affines localement par le terme courant', async () => {
    const { result } = renderHook(() => useHomeHeader({ site: 'resto', popularFull: [] }));
    act(() => result.current.openSearch());
    act(() => result.current.setSearchQuery('zebu'));
    await waitFor(() => expect(result.current.searchResults).toHaveLength(1));

    act(() => result.current.setSearchQuery('zebux'));
    expect(result.current.searchResults).toHaveLength(0);
  });

  // Contre-audit 1 (defaut 6): un 429 ou un 500 s'affichait "aucun resultat".
  it.each([429, 500])('un refus %d est une erreur, pas "aucun resultat"', async (status) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    const { result } = renderHook(() => useHomeHeader({ site: 'resto', popularFull: [] }));
    act(() => result.current.openSearch());
    act(() => result.current.setSearchQuery('zebu'));
    await waitFor(() => expect(result.current.searchError).toBe(true));
    expect(result.current.searchLoading).toBe(false);
  });

  it('temoin: une reponse vide n est pas une erreur', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const { result } = renderHook(() => useHomeHeader({ site: 'resto', popularFull: [] }));
    act(() => result.current.openSearch());
    act(() => result.current.setSearchQuery('zebu'));
    await waitFor(() => expect(result.current.searchLoading).toBe(false));
    expect(result.current.searchError).toBe(false);
    expect(result.current.searchResults).toEqual([]);
  });

  it('une seule lettre ne part pas au serveur', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useHomeHeader({ site: 'resto', popularFull: [] }));
      act(() => result.current.openSearch());
      act(() => result.current.setSearchQuery('z'));
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.searchTooShort).toBe(true);
      expect(result.current.searchLoading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('une frappe continue ne fait qu une requete (pause de frappe)', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useHomeHeader({ site: 'resto', popularFull: [] }));
      act(() => result.current.openSearch());
      for (const q of ['ze', 'zeb', 'zebu']) {
        act(() => result.current.setSearchQuery(q));
        act(() => {
          vi.advanceTimersByTime(150);
        });
      }
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('/api/menu-search?q=zebu');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cherche aussi par le nom anglais dans l affinage local', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ items: [{ ...zebu, id: 'p', name: 'Poulet', name_en: 'Chicken' }] }),
        {
          status: 200,
        },
      ),
    );
    const { result } = renderHook(() => useHomeHeader({ site: 'resto', popularFull: [] }));
    act(() => result.current.openSearch());
    act(() => result.current.setSearchQuery('chicken'));
    await waitFor(() => expect(result.current.searchResults.map((r) => r.id)).toEqual(['p']));
  });
});
