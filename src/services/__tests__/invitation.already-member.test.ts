import { describe, it, expect, vi } from 'vitest';
import { createInvitationService } from '../invitation.service';

/**
 * Audit du 2026-11-10 (C-072): inviter une adresse deja membre du restaurant
 * etait accepte, et l'invitation portait un autre role que celui du membre.
 */
function client(rows: Array<{ id: string }>, error: unknown = null) {
  const filtres: Array<[string, unknown]> = [];
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'in', 'is']) {
    chain[op] = vi.fn((col: string, val: unknown) => {
      if (op !== 'select') filtres.push([`${op}:${col}`, val]);
      return chain;
    });
  }
  chain.limit = vi.fn(async () => ({ data: rows, error }));
  const from = vi.fn(() => chain);
  return {
    supabase: { from } as unknown as Parameters<typeof createInvitationService>[0],
    filtres,
    from,
  };
}

describe('assertNotAlreadyMember', () => {
  it('refuse une adresse deja membre de ce restaurant', async () => {
    const { supabase } = client([{ id: 'membre-1' }]);

    await expect(
      createInvitationService(supabase).assertNotAlreadyMember('tenant-1', 'Awa@Resto.com'),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  // Temoin negatif: une adresse inconnue de l'equipe passe.
  it('laisse passer une adresse qui n est pas dans l equipe', async () => {
    const { supabase } = client([]);

    await expect(
      createInvitationService(supabase).assertNotAlreadyMember('tenant-1', 'new@resto.com'),
    ).resolves.toBeUndefined();
  });

  it('ne cherche que dans CE restaurant, parmi les membres non retires, sans tenir compte de la casse', async () => {
    const { supabase, filtres, from } = client([]);

    await createInvitationService(supabase).assertNotAlreadyMember('tenant-1', ' Awa@Resto.com ');

    expect(from).toHaveBeenCalledWith('admin_users');
    expect(filtres).toContainEqual(['eq:tenant_id', 'tenant-1']);
    expect(filtres).toContainEqual(['is:deleted_at', null]);
    const emails = filtres.find(([k]) => k === 'in:email')?.[1] as string[];
    expect(emails).toContain('awa@resto.com');
  });

  it('refuse (fail-closed) quand la lecture de l equipe echoue', async () => {
    const { supabase } = client([], { message: 'boom' });

    await expect(
      createInvitationService(supabase).assertNotAlreadyMember('tenant-1', 'a@b.co'),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
