import { describe, it, expect } from 'vitest';
import { makeQueryClient } from '../QueryProvider';

// OFF-01. Sans `mutations.networkMode`, TanStack retombe sur 'online' et met les
// mutations en pause des que l'appareil passe hors ligne: mutationFn n'est jamais
// appelee, donc submitOrder et outbox.enqueue non plus. Sur une tablette de caisse
// dont le wifi coupe en plein service, la commande disparait sans message.
// Ce test existe pour que la regression ne puisse pas revenir en silence.
describe('makeQueryClient', () => {
  it('met les mutations en offlineFirst pour que l outbox soit alimentee hors ligne', () => {
    const client = makeQueryClient();

    expect(client.getDefaultOptions().mutations?.networkMode).toBe('offlineFirst');
  });

  it('garde les queries en offlineFirst (lecture depuis le cache persiste)', () => {
    const client = makeQueryClient();

    expect(client.getDefaultOptions().queries?.networkMode).toBe('offlineFirst');
  });
});
