import { describe, it, expect } from 'vitest';
import { COMPANY, emailFooterLine, filledCompanyFields } from '../company';

describe('filledCompanyFields', () => {
  it('omet tous les champs vides: aucune ligne provisoire pour le public', () => {
    expect(filledCompanyFields(COMPANY)).toEqual([]);
  });

  it('ne garde que les champs renseignes, dans l ordre, sans espaces', () => {
    const rows = filledCompanyFields({ ...COMPANY, niu: ' M1234 ', legalName: 'ATTABL SARL' });
    expect(rows).toEqual([
      { key: 'legalName', value: 'ATTABL SARL' },
      { key: 'niu', value: 'M1234' },
    ]);
  });

  it('un champ fait d espaces compte comme vide', () => {
    expect(filledCompanyFields({ ...COMPANY, rccm: '   ' })).toEqual([]);
  });
});

describe('emailFooterLine', () => {
  it('sans identite renseignee: le nom du produit seul, ni forme juridique ni ville', () => {
    expect(emailFooterLine(COMPANY)).toBe('ATTABL');
  });

  it('reprend la raison sociale et le siege renseignes', () => {
    expect(
      emailFooterLine({ ...COMPANY, legalName: 'ATTABL SARL', headOffice: ' Yaounde, Cameroun ' }),
    ).toBe('ATTABL SARL - Yaounde, Cameroun');
  });
});
