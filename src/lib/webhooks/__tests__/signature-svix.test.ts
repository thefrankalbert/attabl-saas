import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { verifierSignatureSvix } from '../signature-svix';

const CLE = Buffer.from('cle-de-test-du-webhook-resend-32o');
const SECRET = `whsec_${CLE.toString('base64')}`;
const MAINTENANT_MS = 1_800_000_000_000;
const TS = String(MAINTENANT_MS / 1000);
const CORPS = '{"type":"email.bounced"}';

function signer(id: string, ts: string, corps: string, cle: Buffer = CLE): string {
  return `v1,${createHmac('sha256', cle).update(`${id}.${ts}.${corps}`).digest('base64')}`;
}

describe('verifierSignatureSvix', () => {
  it('accepte une signature valide', () => {
    const verdict = verifierSignatureSvix(
      CORPS,
      { id: 'msg_1', timestamp: TS, signature: signer('msg_1', TS, CORPS) },
      SECRET,
      MAINTENANT_MS,
    );
    expect(verdict).toEqual({ valide: true });
  });

  it('accepte quand une des signatures (rotation de secret) est valide', () => {
    const autre = signer('msg_1', TS, CORPS, Buffer.from('ancienne-cle'));
    const verdict = verifierSignatureSvix(
      CORPS,
      { id: 'msg_1', timestamp: TS, signature: `${autre} ${signer('msg_1', TS, CORPS)}` },
      SECRET,
      MAINTENANT_MS,
    );
    expect(verdict.valide).toBe(true);
  });

  it('refuse un corps modifie apres signature', () => {
    const verdict = verifierSignatureSvix(
      '{"type":"email.complained"}',
      { id: 'msg_1', timestamp: TS, signature: signer('msg_1', TS, CORPS) },
      SECRET,
      MAINTENANT_MS,
    );
    expect(verdict).toEqual({ valide: false, raison: 'signature_invalide' });
  });

  it('refuse une signature faite avec une autre cle', () => {
    const verdict = verifierSignatureSvix(
      CORPS,
      { id: 'msg_1', timestamp: TS, signature: signer('msg_1', TS, CORPS, Buffer.from('x')) },
      SECRET,
      MAINTENANT_MS,
    );
    expect(verdict.valide).toBe(false);
  });

  it('refuse un horodatage de plus de 5 minutes, dans les deux sens', () => {
    for (const decalage of [-301, 301]) {
      const ts = String(MAINTENANT_MS / 1000 + decalage);
      const verdict = verifierSignatureSvix(
        CORPS,
        { id: 'msg_1', timestamp: ts, signature: signer('msg_1', ts, CORPS) },
        SECRET,
        MAINTENANT_MS,
      );
      expect(verdict).toEqual({ valide: false, raison: 'horodatage_perime' });
    }
  });

  it('accepte un horodatage a 4 minutes (temoin de la tolerance)', () => {
    const ts = String(MAINTENANT_MS / 1000 - 240);
    const verdict = verifierSignatureSvix(
      CORPS,
      { id: 'msg_1', timestamp: ts, signature: signer('msg_1', ts, CORPS) },
      SECRET,
      MAINTENANT_MS,
    );
    expect(verdict.valide).toBe(true);
  });

  it('refuse quand un en-tete manque', () => {
    const verdict = verifierSignatureSvix(
      CORPS,
      { id: null, timestamp: TS, signature: signer('msg_1', TS, CORPS) },
      SECRET,
      MAINTENANT_MS,
    );
    expect(verdict).toEqual({ valide: false, raison: 'entetes_manquants' });
  });
});
