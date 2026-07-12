import { describe, it, expect } from 'vitest';
import { qrDesignReducer } from '../useQRDesignConfig';
import {
  createDefaultQRDesignConfig,
  TEMPLATE_DEFAULTS,
  type QRTemplateId,
} from '@/types/qr-design.types';

const base = createDefaultQRDesignConfig('#CCFF00');

describe('qrDesignReducer', () => {
  it('HYDRATE replaces the whole state with the given config', () => {
    const loaded = { ...base, ctaText: 'Scannez ici', qrFgColor: '#123456' };
    const next = qrDesignReducer(base, { type: 'HYDRATE', config: loaded });
    expect(next).toEqual(loaded);
  });

  it('SET_FIELD updates one field and keeps the rest', () => {
    const next = qrDesignReducer(base, {
      type: 'SET_FIELD',
      key: 'qrFgColor',
      value: '#000000',
    });
    expect(next.qrFgColor).toBe('#000000');
    expect(next.templateId).toBe(base.templateId);
  });

  it('SET_TEMPLATE updates templateId + qrSize but preserves other fields', () => {
    const target: QRTemplateId = base.templateId === 'minimal' ? 'carte' : 'minimal';
    const withCustomCta = { ...base, ctaText: 'Table 12' };
    const next = qrDesignReducer(withCustomCta, { type: 'SET_TEMPLATE', templateId: target });
    expect(next.templateId).toBe(target);
    expect(next.qrSize).toBe(TEMPLATE_DEFAULTS[target].qrSize);
    // Non-template fields must survive a template switch.
    expect(next.ctaText).toBe('Table 12');
  });
});
