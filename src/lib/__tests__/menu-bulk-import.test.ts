import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bulkImportMenuRows } from '../menu-bulk-import';
import { isMissingDeletedAtColumnError } from '../menu-items-query';

function createBulkMockSupabase() {
  const categories = [{ id: 'cat-1', name: 'Entrees', display_order: 0 }];
  const from = vi.fn((table: string) => {
    if (table === 'categories') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: categories, error: null }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }
    if (table === 'menu_items') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return {};
  });

  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('isMissingDeletedAtColumnError', () => {
  it('detects missing deleted_at column', () => {
    expect(isMissingDeletedAtColumnError({ code: '42703', message: 'column deleted_at' })).toBe(
      true,
    );
    expect(isMissingDeletedAtColumnError({ message: 'other' })).toBe(false);
  });
});

describe('bulkImportMenuRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports items into an existing category in one batch', async () => {
    const supabase = createBulkMockSupabase();
    const grouped = new Map([
      [
        'Entrees',
        {
          categoryEn: null,
          items: [
            {
              rowKey: 1,
              category: 'Entrees',
              name: 'Salade',
              price: 5,
              isAvailable: true,
              isFeatured: false,
            },
          ],
        },
      ],
    ]);

    const result = await bulkImportMenuRows(supabase, 'tenant-1', 'menu-1', grouped);

    expect(result.categoriesExisting).toBe(1);
    expect(result.itemsCreated).toBe(1);
    expect(result.itemsSkipped).toBe(0);
    expect(supabase.from).toHaveBeenCalledWith('menu_items');
  });
});
