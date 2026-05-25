import { describe, it, expect } from 'vitest';
import { isMissingRelationError } from '../supabase/schema-errors';

describe('isMissingRelationError', () => {
  it('detects PGRST205', () => {
    expect(isMissingRelationError({ code: 'PGRST205', message: 'table' })).toBe(true);
  });

  it('detects relation name in message', () => {
    expect(
      isMissingRelationError(
        { message: 'Could not find the table public.table_assignments' },
        'table_assignments',
      ),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isMissingRelationError({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});
