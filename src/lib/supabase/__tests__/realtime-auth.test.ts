import { describe, expect, it, vi } from 'vitest';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { subscribeWithAuth } from '../realtime-auth';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
import { logger } from '@/lib/logger';

function fakeClient(setAuth: () => Promise<void>) {
  const removeChannel = vi.fn(async () => 'ok');
  const client = { realtime: { setAuth }, removeChannel } as unknown as SupabaseClient;
  return { client, removeChannel };
}

const channel = () => ({ unsubscribe: vi.fn() }) as unknown as RealtimeChannel;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('subscribeWithAuth', () => {
  it('joins only AFTER the user token is handed to Realtime', async () => {
    let release: () => void = () => {};
    const setAuth = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { client } = fakeClient(setAuth);
    const join = vi.fn(() => [channel()]);

    subscribeWithAuth(client, 'kds', join);
    await flush();
    expect(setAuth).toHaveBeenCalledTimes(1);
    expect(join).not.toHaveBeenCalled();

    release();
    await flush();
    expect(join).toHaveBeenCalledTimes(1);
  });

  it('never joins when the screen is closed before the token arrives', async () => {
    let release: () => void = () => {};
    const { client } = fakeClient(() => new Promise<void>((r) => (release = r)));
    const join = vi.fn(() => [channel()]);

    const cleanup = subscribeWithAuth(client, 'kds', join);
    cleanup();
    release();
    await flush();
    expect(join).not.toHaveBeenCalled();
  });

  it('still joins when setAuth fails (polling fallback is not the only path left)', async () => {
    const { client } = fakeClient(() => Promise.reject(new Error('offline')));
    const join = vi.fn(() => [channel()]);
    subscribeWithAuth(client, 'kds', join);
    await flush();
    expect(join).toHaveBeenCalledTimes(1);
  });

  it('logs a join that throws instead of leaving an unhandled rejection', async () => {
    const { client } = fakeClient(async () => {});
    const cleanup = subscribeWithAuth(client, 'kds', () => {
      throw new Error('cannot add postgres_changes after subscribe');
    });
    await flush();
    expect(logger.warn).toHaveBeenCalledWith('Realtime join failed for kds', expect.anything());
    expect(() => cleanup()).not.toThrow();
  });

  it('cleanup unsubscribes and removes every joined channel', async () => {
    const { client, removeChannel } = fakeClient(async () => {});
    const a = channel();
    const b = channel();
    const cleanup = subscribeWithAuth(client, 'dashboard', () => [a, b]);
    await flush();
    cleanup();
    expect(a.unsubscribe).toHaveBeenCalled();
    expect(b.unsubscribe).toHaveBeenCalled();
    expect(removeChannel).toHaveBeenCalledTimes(2);
  });
});
