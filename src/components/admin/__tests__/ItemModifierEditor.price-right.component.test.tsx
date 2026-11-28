// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { ItemModifier } from '@/types/admin.types';
import type { PermissionMap } from '@/types/permission.types';

/**
 * Contre-audit N3. Supprimer un supplement PAYANT exige `menu.price` (serveur
 * et base). Sans ce droit, la corbeille etait quand meme proposee et le refus
 * arrivait en "Erreur" generique. Elle n'est plus proposee, et tout refus de
 * droit dit pourquoi.
 */
const toast = vi.fn();
const actionDeleteModifier = vi.fn();
const actionCreateModifier = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/app/actions/modifiers', () => ({
  actionCreateModifier: (...a: unknown[]) => actionCreateModifier(...a),
  actionDeleteModifier: (...a: unknown[]) => actionDeleteModifier(...a),
  actionToggleModifierAvailable: vi.fn(),
}));

import ItemModifierEditor from '../ItemModifierEditor';

const mod = (id: string, name: string, price: number, prices?: Record<string, number>) =>
  ({
    id,
    tenant_id: 't',
    menu_item_id: 'i',
    name,
    price,
    prices,
    is_available: true,
  }) as ItemModifier;
const MODS = [
  mod('m1', 'Fromage', 500),
  mod('m2', 'Sans oignon', 0),
  mod('m3', 'Sauce', 0, { XOF: 200 }),
];

function renderEditor(overrides: PermissionMap = {}) {
  const levels = getEffectiveLevels({ postes: ['chef'], permission_overrides: overrides });
  return render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <PermissionsProvider postes={['chef']} levels={levels}>
        <ItemModifierEditor
          tenantId="t"
          menuItemId="i"
          menuItemName="Riz gras"
          modifiers={MODS}
          onUpdate={vi.fn()}
          onClose={vi.fn()}
        />
      </PermissionsProvider>
    </NextIntlClientProvider>,
  );
}
/** Le bouton corbeille de la ligne qui porte ce nom, s'il existe. */
const trashOf = (name: string) =>
  screen.getByText(name).closest('.group')?.querySelector('button[title="Supprimer"]') ?? null;

beforeEach(() => {
  toast.mockReset();
  actionDeleteModifier.mockReset();
  actionCreateModifier.mockReset();
});
afterEach(cleanup);

describe('ItemModifierEditor - supplement payant et droit de prix', () => {
  it('chef sans menu.price: pas de corbeille sur un supplement payant, par price ou par prices', () => {
    renderEditor({ 'menu.price': false });
    expect(trashOf('Fromage')).toBeNull();
    expect(trashOf('Sauce')).toBeNull();
    // Temoin: le supplement gratuit garde sa corbeille (menu.edit suffit).
    expect(trashOf('Sans oignon')).not.toBeNull();
  });

  it('temoin, chef par defaut (menu.price): la corbeille est sur chaque ligne', () => {
    renderEditor();
    for (const name of ['Fromage', 'Sans oignon', 'Sauce']) expect(trashOf(name)).not.toBeNull();
  });

  it('refus de droit a la suppression: message precis, pas "Erreur"', async () => {
    actionDeleteModifier.mockResolvedValue({
      error: 'Permissions insuffisantes',
      code: 'forbidden',
    });
    renderEditor();
    fireEvent.click(trashOf('Fromage') as Element);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: messages.modifiers.needsPriceRight,
        variant: 'destructive',
      }),
    );
  });

  it('temoin: une panne reste une erreur generique', async () => {
    actionDeleteModifier.mockResolvedValue({ error: 'Server error' });
    renderEditor();
    fireEvent.click(trashOf('Fromage') as Element);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: messages.common.error, variant: 'destructive' }),
    );
  });

  it('sans menu.price: ajouter un supplement payant est refuse a l ecran, sans appel au serveur', () => {
    renderEditor({ 'menu.price': false });
    fireEvent.change(screen.getByLabelText(messages.modifiers.namePlaceholder), {
      target: { value: 'Bacon' },
    });
    fireEvent.change(screen.getByLabelText(messages.modifiers.pricePlaceholder), {
      target: { value: '300' },
    });
    fireEvent.click(screen.getByRole('button', { name: messages.modifiers.addNew }));
    expect(actionCreateModifier).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: messages.modifiers.needsPriceRight,
      variant: 'destructive',
    });
  });
});
