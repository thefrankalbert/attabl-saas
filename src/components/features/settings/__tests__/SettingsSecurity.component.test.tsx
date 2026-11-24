// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { Tabs } from '@/components/ui/tabs';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { DEFAULT_PERMISSIONS, type PermissionCode } from '@/types/permission.types';
import type { SettingsFormValues } from '@/hooks/useSettingsData';
import SettingsSecurity from '../SettingsSecurity';

const toast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { email: 'chef@lejardin.bf' } } }) },
  }),
}));
const prepareLogout = vi.fn();
vi.mock('@/lib/offline/browser-logout-cleanup', () => ({
  prepareLogoutInBrowser: (...a: unknown[]) => prepareLogout(...a),
}));
vi.mock('@/app/actions/account-deletion', () => ({
  actionDeleteOwnerAccount: vi.fn(),
  actionDeleteStaffAccount: vi.fn(),
}));

const fetchMock = vi.fn();

function Harness({ idle }: { idle: number | null }) {
  const form = useForm<SettingsFormValues>({
    defaultValues: { idleTimeoutMinutes: idle, screenLockMode: 'overlay' } as SettingsFormValues,
  });
  const values = form.watch();
  return (
    <>
      <Tabs value="security">
        <SettingsSecurity
          form={form}
          t={(k: string) => (messages.settings as unknown as Record<string, string>)[k] ?? k}
          tenantSlug="lejardin"
          tenantName="Le Jardin"
        />
      </Tabs>
      <output data-testid="valeurs">{JSON.stringify(values)}</output>
    </>
  );
}

function renderPage(idle: number | null) {
  render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <PermissionsProvider
        role="owner"
        permissions={DEFAULT_PERMISSIONS.owner as Record<PermissionCode, boolean>}
      >
        <Harness idle={idle} />
      </PermissionsProvider>
    </NextIntlClientProvider>,
  );
}

const valeurs = () => JSON.parse(screen.getByTestId('valeurs').textContent ?? '{}');

describe('page Securite', () => {
  beforeEach(() => {
    toast.mockReset();
    prepareLogout.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('verrouillage coupe: aucun reglage de delai affiche; active: 30 minutes par defaut', () => {
    renderPage(null);
    expect(screen.queryByText('Verrouiller après')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('switch', { name: "Verrouiller l'écran quand personne ne s'en sert" }),
    );
    expect(valeurs().idleTimeoutMinutes).toBe(30);
    expect(screen.getByText('Verrouiller après')).toBeInTheDocument();
  });

  it('un delai enregistre hors de la liste (25 min) reste affiche', () => {
    renderPage(25);
    expect(screen.getByRole('combobox', { name: 'Verrouiller après' })).toHaveTextContent(
      '25 minutes',
    );
  });

  it('choisir "Saisir le mot de passe" change le mode de deverrouillage', () => {
    renderPage(30);
    fireEvent.click(screen.getByRole('radio', { name: /Saisir le mot de passe/ }));
    expect(valeurs().screenLockMode).toBe('password');
  });

  it('"Changer le mot de passe" envoie le lien a l adresse du compte', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    renderPage(null);
    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/forgot-password');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'chef@lejardin.bf' });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Lien envoyé à chef@lejardin.bf. Il est valable 1 heure.',
      }),
    );
  });

  it('se deconnecter partout est refuse tant que des commandes attendent', async () => {
    prepareLogout.mockResolvedValue({ blocked: true, pending: 2, lost: 0 });
    renderPage(null);
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter partout' }));
    const dialogButtons = await screen.findAllByRole('button', { name: 'Se déconnecter partout' });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() => expect(prepareLogout).toHaveBeenCalledWith({ force: false }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/signout', expect.anything());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('se deconnecter partout ne redirige pas si le serveur refuse (429)', async () => {
    prepareLogout.mockResolvedValue({ blocked: false, pending: 0, lost: 0 });
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderPage(null);
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter partout' }));
    const dialogButtons = await screen.findAllByRole('button', { name: 'Se déconnecter partout' });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Trop de tentatives. Réessayez dans une minute.',
        variant: 'destructive',
      }),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('se deconnecter partout appelle la deconnexion quand la file est vide', async () => {
    prepareLogout.mockResolvedValue({ blocked: false, pending: 0, lost: 0 });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderPage(null);
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter partout' }));
    const dialogButtons = await screen.findAllByRole('button', { name: 'Se déconnecter partout' });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
  });
});
