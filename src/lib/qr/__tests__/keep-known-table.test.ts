import { describe, it, expect } from 'vitest';
import { keepKnownTable } from '../table-param';

describe('keepKnownTable (C-061)', () => {
  const tables = [
    { table_number: 'TER-1', is_active: true },
    { table_number: 'TER-2', is_active: false },
  ];
  it('keeps an active table of the restaurant', () => {
    expect(keepKnownTable('TER-1', tables)).toBe('TER-1');
  });
  it('drops an unknown or inactive table', () => {
    expect(keepKnownTable('TAB-99', tables)).toBeUndefined();
    expect(keepKnownTable('TER-2', tables)).toBeUndefined();
    expect(keepKnownTable(undefined, tables)).toBeUndefined();
  });
});
