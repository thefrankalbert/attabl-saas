import { describe, it, expect, vi } from 'vitest';
import { createSupportsService } from '@/services/supports.service';
import type { ChevaletConfig } from '@/types/supports.types';

const validConfig: ChevaletConfig = {
  unit: 'cm',
  background: '#1A1A1A',
  accentColor: '#FFFFFF',
  logo: { visible: true, x: 1, y: 0.8, width: 2.5 },
  name: { visible: true, x: 1, y: 4, fontSize: 18, text: 'Le Jardin' },
  tagline: { visible: false, x: 1, y: 5.5, fontSize: 10, text: '' },
  qrCode: { x: 14.5, y: 0.8, width: 6, style: 'classic', menuUrl: 'https://lejardin.attabl.com' },
  verso: 'none',
};

const makeMockSupabase = (overrides?: object) => ({
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  upsert: vi.fn().mockResolvedValue({ error: null }),
  ...overrides,
});

describe('createSupportsService', () => {
  describe('getConfig', () => {
    it('returns null when no config saved', async () => {
      const supabase = makeMockSupabase();
      const service = createSupportsService(supabase as never);
      const result = await service.getConfig('tenant-123');
      expect(result).toBeNull();
    });

    it('returns config when one exists', async () => {
      const supabase = makeMockSupabase({
        maybeSingle: vi.fn().mockResolvedValue({ data: { config: validConfig }, error: null }),
      });
      const service = createSupportsService(supabase as never);
      const result = await service.getConfig('tenant-123');
      expect(result).toEqual(validConfig);
    });

    it('throws ServiceError on DB error', async () => {
      const supabase = makeMockSupabase({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      });
      const service = createSupportsService(supabase as never);
      await expect(service.getConfig('tenant-123')).rejects.toThrow('Failed to load');
    });

    it('filters by tenant_id and type', async () => {
      const supabase = makeMockSupabase();
      const service = createSupportsService(supabase as never);
      await service.getConfig('tenant-abc');
      expect(supabase.eq).toHaveBeenNthCalledWith(1, 'tenant_id', 'tenant-abc');
      expect(supabase.eq).toHaveBeenNthCalledWith(2, 'type', 'chevalet_standard');
    });
  });

  describe('saveConfig', () => {
    it('upserts config with correct data', async () => {
      const supabase = makeMockSupabase();
      const service = createSupportsService(supabase as never);
      await service.saveConfig('tenant-123', validConfig);
      expect(supabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-123',
          type: 'chevalet_standard',
          config: validConfig,
        }),
        { onConflict: 'tenant_id,type' },
      );
    });

    it('throws ServiceError on upsert error', async () => {
      const supabase = makeMockSupabase({
        upsert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
      });
      const service = createSupportsService(supabase as never);
      await expect(service.saveConfig('tenant-123', validConfig)).rejects.toThrow('Failed to save');
    });
  });
});
