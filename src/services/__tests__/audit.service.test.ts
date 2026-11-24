import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { loggerError } = vi.hoisted(() => ({ loggerError: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { createAuditService } from '../audit.service';

function clientReturning(result: { error: unknown }): SupabaseClient {
  return {
    from: () => ({ insert: async () => result }),
  } as unknown as SupabaseClient;
}

describe('createAuditService.log (B30)', () => {
  beforeEach(() => loggerError.mockClear());

  it('journalise un refus d insertion rendu dans error, sans lever', async () => {
    const audit = createAuditService(clientReturning({ error: { code: '42501' } }), {
      tenantId: 't1',
    });
    await expect(
      audit.log({ action: 'update', entityType: 'setting', entityId: 's1' }),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith(
      'Audit log insert refused',
      { code: '42501' },
      expect.objectContaining({ action: 'update', entityType: 'setting', entityId: 's1' }),
    );
  });

  it('temoin: une insertion reussie ne journalise rien', async () => {
    const audit = createAuditService(clientReturning({ error: null }), { tenantId: 't1' });
    await audit.log({ action: 'create', entityType: 'menu' });
    expect(loggerError).not.toHaveBeenCalled();
  });
});
