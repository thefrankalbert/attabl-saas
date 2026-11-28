// @vitest-environment happy-dom
import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';

/**
 * Refus de la camera sur un appareil dont la liste des peripheriques arrive
 * APRES le refus (cas de la CI, sans camera, et de certains navigateurs). La
 * detection "aucune camera" ecrasait alors "acces refuse": le convive lisait
 * "Aucune camera trouvee" au lieu d'apprendre ou autoriser la camera, et le
 * parcours 09 de la CI echouait une fois sur deux.
 */

vi.mock('@yudiel/react-qr-scanner', () => ({
  setZXingModuleOverrides: vi.fn(),
  Scanner: ({ onError }: { onError: (e: { kind: string }) => void }) => {
    // Comme la vraie bibliotheque: le refus arrive apres un getUserMedia asynchrone.
    useEffect(() => {
      void Promise.resolve().then(() => onError({ kind: 'permission-denied' }));
    }, [onError]);
    return null;
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import QRScanner from '../QRScanner';

let resoudreListe: (devices: MediaDeviceInfo[]) => void = () => {};

beforeEach(() => {
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(),
      enumerateDevices: () =>
        new Promise<MediaDeviceInfo[]>((resolve) => {
          resoudreListe = resolve;
        }),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ouvrir() {
  render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <QRScanner isOpen onClose={() => {}} onScan={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe('scanner QR: refus de la camera', () => {
  it('un refus reste un refus quand la liste des cameras arrive vide ensuite', async () => {
    ouvrir();
    expect(await screen.findByText('Accès à la caméra refusé')).toBeInTheDocument();
    await act(async () => resoudreListe([]));
    expect(screen.getByText('Accès à la caméra refusé')).toBeInTheDocument();
    expect(screen.queryByText('Aucune caméra trouvée')).toBeNull();
  });
});
