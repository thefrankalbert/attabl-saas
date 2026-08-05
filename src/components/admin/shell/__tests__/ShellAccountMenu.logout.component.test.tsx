// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * OFF-03. Ce qui est verifie ici est un COMPORTEMENT, pas une apparence: sans ces
 * tests, deux regressions passent les cinq portes sans bruit.
 *
 *   1. La deconnexion forcee declenchee toute seule. `onClick={handleLogout}`
 *      passe l'evenement de clic comme premier argument, donc comme `force` -
 *      un objet, donc toujours vrai. Chaque deconnexion sortirait en force sans
 *      la moindre confirmation, en abandonnant les commandes encaissees.
 *   2. Le blocage sans issue. Si la confirmation disparait, une panne reseau en
 *      fin de service IMMOBILISE la tablette: file impossible a vider donc
 *      deconnexion impossible, donc le serveur suivant ne peut pas prendre son
 *      poste.
 */

const mockPrepareLogout = vi.fn();
vi.mock('@/lib/offline/browser-logout-cleanup', () => ({
  prepareLogoutInBrowser: (options?: { force?: boolean }) => mockPrepareLogout(options),
}));

const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

// Les cles sont rendues telles quelles: on verifie le cablage, pas la traduction.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Le menu deroulant Radix ne s'ouvre pas au clic dans happy-dom: on l'aplatit
// pour atteindre directement l'item de deconnexion.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => null,
}));

// L'AlertDialog Radix utilise un portail: on le rend inline, en gardant la
// condition `open` qui est justement ce qu'on veut prouver.
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="confirm">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button data-testid="force" onClick={onClick}>
      {children}
    </button>
  ),
}));

import { ShellAccountMenu } from '../ShellAccountMenu';

const props = {
  basePath: '/sites/demo/admin',
  tenantSlug: 'demo',
  userName: 'Fatou',
  userEmail: 'fatou@demo.test',
  initials: 'F',
  planName: 'Pro',
  planRaw: 'pro',
  collapsed: false,
};

function clickLogout() {
  fireEvent.click(screen.getByRole('button', { name: 'logout' }));
}

describe('ShellAccountMenu - deconnexion et file hors ligne', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    // window.location.assign n'est pas implemente dans happy-dom.
    Object.defineProperty(window, 'location', {
      value: { assign: vi.fn() },
      writable: true,
    });
  });

  it('ne force JAMAIS la deconnexion sur un simple clic', async () => {
    mockPrepareLogout.mockResolvedValue({ blocked: false, pending: 0, lost: 0 });
    render(<ShellAccountMenu {...props} />);

    clickLogout();

    await waitFor(() => expect(mockPrepareLogout).toHaveBeenCalled());
    // Le piege: si l'evenement de clic arrivait jusqu'a `force`, l'objet recu
    // ici serait `{ force: <SyntheticEvent> }`, donc verifie a l'execution.
    expect(mockPrepareLogout).toHaveBeenCalledWith({ force: false });
  });

  it('file vide: deconnecte sans rien demander', async () => {
    mockPrepareLogout.mockResolvedValue({ blocked: false, pending: 0, lost: 0 });
    render(<ShellAccountMenu {...props} />);

    clickLogout();

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' }),
    );
    expect(screen.queryByTestId('confirm')).not.toBeInTheDocument();
  });

  it('file non vide: demande confirmation, explique le sort des commandes, ne deconnecte pas', async () => {
    mockPrepareLogout.mockResolvedValue({ blocked: true, pending: 3, lost: 0 });
    render(<ShellAccountMenu {...props} />);

    clickLogout();

    await waitFor(() => expect(screen.getByTestId('confirm')).toBeInTheDocument());
    // La phrase qui rend le choix informe plutot qu'aveugle sur de l'argent
    // deja encaisse.
    expect(screen.getByText('logoutForceExplain')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('confirmation acceptee: deconnecte en force, sans jamais vider la file', async () => {
    mockPrepareLogout.mockResolvedValueOnce({ blocked: true, pending: 3, lost: 0 });
    render(<ShellAccountMenu {...props} />);
    clickLogout();
    await waitFor(() => expect(screen.getByTestId('confirm')).toBeInTheDocument());

    mockPrepareLogout.mockResolvedValueOnce({ blocked: false, pending: 3, lost: 0 });
    fireEvent.click(screen.getByTestId('force'));

    await waitFor(() => expect(mockPrepareLogout).toHaveBeenLastCalledWith({ force: true }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' }),
    );
  });

  it('commandes detruites pendant le drain force: le dit, ne les passe pas sous silence', async () => {
    mockPrepareLogout.mockResolvedValue({ blocked: false, pending: 0, lost: 2 });
    render(<ShellAccountMenu {...props} />);

    clickLogout();

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(mockToast.mock.calls[0][0]).toMatchObject({ variant: 'destructive' });
  });
});
