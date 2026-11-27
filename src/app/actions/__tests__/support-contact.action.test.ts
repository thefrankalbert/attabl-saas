import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '@/lib/auth/get-session';

const requireSuperAdmin = vi.fn();
const saveSupportContact = vi.fn();
vi.mock('@/lib/auth/require-super-admin', () => ({ requireSuperAdmin }));
vi.mock('@/services/platform-settings.service', () => ({ saveSupportContact }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

const { actionUpdateSupportContact } = await import('../platform-admin');

describe('actionUpdateSupportContact', () => {
  beforeEach(() => {
    requireSuperAdmin.mockReset();
    saveSupportContact.mockReset();
  });

  it('refuse un non super administrateur AVANT toute ecriture', async () => {
    requireSuperAdmin.mockRejectedValue(new AuthError('Acces refuse', 403));
    const res = await actionUpdateSupportContact('+237 6 99 00 11 22');
    expect(res.error).toBe('Acces refuse');
    expect(saveSupportContact).not.toHaveBeenCalled();
  });

  it('refuse un numero sans indicatif sans rien ecrire', async () => {
    requireSuperAdmin.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } });
    const res = await actionUpdateSupportContact('70 12 34 56');
    expect(res.error).toBeTruthy();
    expect(saveSupportContact).not.toHaveBeenCalled();
  });

  it('enregistre pour un super administrateur (temoin positif)', async () => {
    requireSuperAdmin.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } });
    const res = await actionUpdateSupportContact('+237 6 99 00 11 22');
    expect(res).toEqual({ success: true });
    expect(saveSupportContact).toHaveBeenCalledWith({}, '+237 6 99 00 11 22', {
      userId: 'u1',
      email: 'a@b.c',
    });
  });
});
