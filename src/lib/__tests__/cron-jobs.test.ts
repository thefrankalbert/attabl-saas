import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRON_JOBS, cronSilenceLimitMs } from '../cron-jobs';

describe('CRON_JOBS', () => {
  it('dit la meme chose que vercel.json (chemin et frequence)', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    const fromVercel = Object.fromEntries(
      vercel.crons.map((c) => [c.path.replace('/api/cron/', ''), c.schedule]),
    );
    expect(fromVercel).toEqual(CRON_JOBS);
  });

  it('tolere 10 min de silence a la minute, 7 h toutes les 6 h, 25 h pour une tache du jour', () => {
    expect(cronSilenceLimitMs('* * * * *')).toBe(10 * 60_000);
    expect(cronSilenceLimitMs('0 */6 * * *')).toBe(7 * 3_600_000);
    expect(cronSilenceLimitMs('0 2 * * *')).toBe(25 * 3_600_000);
  });
});
