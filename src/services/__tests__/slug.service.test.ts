import { describe, it, expect, vi } from 'vitest';
import { createSlugService } from '../slug.service';

/**
 * Creates a mock Supabase client with configurable responses.
 */
function createMockSupabase(slugExists: boolean = false) {
  const mockSingle = vi.fn().mockResolvedValue({
    data: slugExists ? { slug: 'test-slug' } : null,
    error: slugExists ? null : { code: 'PGRST116' },
  });

  const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

  return {
    from: mockFrom,
    _mocks: { mockFrom, mockSelect, mockEq, mockSingle },
  } as unknown as Parameters<typeof createSlugService>[0];
}

describe('SlugService', () => {
  describe('normalizeToSlug', () => {
    it('should lowercase the name', () => {
      const supabase = createMockSupabase();
      const service = createSlugService(supabase);
      expect(service.normalizeToSlug('MonRestaurant')).toBe('monrestaurant');
    });

    it('should remove accents', () => {
      const supabase = createMockSupabase();
      const service = createSlugService(supabase);
      expect(service.normalizeToSlug('Café Résumé')).toBe('cafe-resume');
    });

    it('should replace special characters with hyphens', () => {
      const supabase = createMockSupabase();
      const service = createSlugService(supabase);
      expect(service.normalizeToSlug('Le Bon & Le Beau!')).toBe('le-bon-le-beau');
    });

    it('should trim leading and trailing hyphens', () => {
      const supabase = createMockSupabase();
      const service = createSlugService(supabase);
      expect(service.normalizeToSlug('---hello---')).toBe('hello');
    });

    it('should handle names with numbers', () => {
      const supabase = createMockSupabase();
      const service = createSlugService(supabase);
      expect(service.normalizeToSlug('Restaurant 42')).toBe('restaurant-42');
    });

    it('should handle empty spaces', () => {
      const supabase = createMockSupabase();
      const service = createSlugService(supabase);
      expect(service.normalizeToSlug('Le   Grand   Café')).toBe('le-grand-cafe');
    });

    it('should handle Arabic/special unicode characters', () => {
      const supabase = createMockSupabase();
      const service = createSlugService(supabase);
      // Non-latin chars get removed, resulting in hyphens that are trimmed
      const result = service.normalizeToSlug('مطعم');
      expect(result).not.toContain(' ');
    });
  });

  describe('generateUniqueSlug', () => {
    it('should return the base slug when no conflict exists', async () => {
      const supabase = createMockSupabase(false);
      const service = createSlugService(supabase);

      const slug = await service.generateUniqueSlug('Mon Restaurant');
      expect(slug).toBe('mon-restaurant');
    });

    it('should append a random number when slug already exists', async () => {
      const supabase = createMockSupabase(true);
      const service = createSlugService(supabase);

      const slug = await service.generateUniqueSlug('Mon Restaurant');
      expect(slug).toMatch(/^mon-restaurant-\d+$/);
    });

    it('should query the tenants table for slug uniqueness', async () => {
      const supabase = createMockSupabase(false);
      const service = createSlugService(supabase);

      await service.generateUniqueSlug('Test');

      expect(supabase.from).toHaveBeenCalledWith('tenants');
    });
  });
});
