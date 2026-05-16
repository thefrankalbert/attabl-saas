import { describe, expect, it } from 'vitest';
import { buildPaginationMeta, parsePaginationFromUrl, toSupabaseRange } from '../pagination';

describe('pagination', () => {
  it('parses page and pageSize from URL', () => {
    const params = parsePaginationFromUrl('http://localhost/api/invitations?page=2&pageSize=10');
    expect(params).toEqual({ page: 2, pageSize: 10 });
  });

  it('defaults page and pageSize when missing', () => {
    const params = parsePaginationFromUrl('http://localhost/api/invitations');
    expect(params.page).toBe(1);
    expect(params.pageSize).toBe(25);
  });

  it('builds supabase range from page', () => {
    expect(toSupabaseRange(2, 25)).toEqual({ from: 25, to: 49 });
  });

  it('builds pagination metadata', () => {
    expect(buildPaginationMeta(1, 25, 60)).toEqual({
      page: 1,
      pageSize: 25,
      total: 60,
      totalPages: 3,
      hasMore: true,
    });
  });
});
