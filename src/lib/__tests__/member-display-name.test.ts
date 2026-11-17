import { describe, it, expect } from 'vitest';
import { memberDisplayName } from '../member-display-name';

describe('memberDisplayName', () => {
  it('returns null when nobody is attached (unassigned)', () => {
    expect(memberDisplayName(null, 'Membre')).toBeNull();
    expect(memberDisplayName(undefined, 'Membre')).toBeNull();
  });

  it('returns the name when there is one', () => {
    expect(memberDisplayName({ full_name: ' Awa ' }, 'Membre')).toBe('Awa');
  });

  it('falls back for an erased or empty name, never an empty cell', () => {
    expect(memberDisplayName({ full_name: null }, 'Membre')).toBe('Membre');
    expect(memberDisplayName({ full_name: '   ' }, 'Membre')).toBe('Membre');
    expect(memberDisplayName({}, 'Membre')).toBe('Membre');
  });
});
