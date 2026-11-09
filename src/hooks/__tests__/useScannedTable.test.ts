// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readScannedTable, saveScannedTable, useScannedTable } from '../useScannedTable';

// The cart reads `attabl_<slug>_table` when the order is placed: this key is
// what attaches an order to its table.
describe('useScannedTable', () => {
  beforeEach(() => localStorage.clear());

  it('persists the table carried by the scanned url and returns it', () => {
    const { result } = renderHook(() => useScannedTable('resto', 'TER-1'));
    expect(localStorage.getItem('attabl_resto_table')).toBe('TER-1');
    expect(result.current).toBe('TER-1');
  });

  it('a new scan replaces a table remembered from an earlier visit', () => {
    localStorage.setItem('attabl_resto_table', 'OLD-9');
    const { result } = renderHook(() => useScannedTable('resto', 'SAL-1'));
    expect(localStorage.getItem('attabl_resto_table')).toBe('SAL-1');
    expect(result.current).toBe('SAL-1');
  });

  it('without a scanned table, returns the remembered one untouched', () => {
    localStorage.setItem('attabl_resto_table', 'OLD-9');
    const { result } = renderHook(() => useScannedTable('resto'));
    expect(result.current).toBe('OLD-9');
  });

  it('re-renders when the table is changed in the same tab (table picker)', () => {
    const { result } = renderHook(() => useScannedTable('resto', 'TER-1'));
    act(() => saveScannedTable('resto', 'TER-2'));
    expect(result.current).toBe('TER-2');
  });

  it('keys the table per tenant', () => {
    renderHook(() => useScannedTable('resto', 'TER-1'));
    expect(localStorage.getItem('attabl_other_table')).toBeNull();
  });

  it('readScannedTable reads back what saveScannedTable wrote (cart order-time read)', () => {
    expect(readScannedTable('resto')).toBeNull();
    saveScannedTable('resto', 'TER-1');
    expect(readScannedTable('resto')).toBe('TER-1');
    expect(readScannedTable('other')).toBeNull();
  });
});
