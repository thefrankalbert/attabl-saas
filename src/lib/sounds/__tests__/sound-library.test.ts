import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOUND_LIBRARY, DEFAULT_SOUND_ID, getSoundFile, isCustomSound } from '../sound-library';

/** Reads the fields of a PCM WAV file that matter for playback. */
function readWav(publicPath: string) {
  const path = join(process.cwd(), 'public', publicPath.split('?')[0]);
  const buf = readFileSync(path);
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
  // Walk the chunks: "fmt " gives the format, "data" gives the length.
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bitsPerSample = buf.readUInt16LE(offset + 22);
    } else if (id === 'data') {
      dataBytes = size;
    }
    offset += 8 + size + (size % 2);
  }
  const seconds = dataBytes / (sampleRate * channels * (bitsPerSample / 8));
  return { channels, sampleRate, bitsPerSample, seconds };
}

describe('bibliotheque de sons de notification', () => {
  it('garde les 10 identifiants enregistres chez les restaurants', () => {
    // Ces ids sont stockes dans tenants.notification_sound_id: en changer un
    // ferait perdre son reglage a un restaurant.
    expect(SOUND_LIBRARY.map((s) => s.id).sort()).toEqual(
      [
        'brass-bell',
        'classic-bell',
        'crystal-bell',
        'elegant-tone',
        'gentle-chime',
        'luxury-chime',
        'simple-ding',
        'soft-marimba',
        'wooden-knock',
        'zen-bowl',
      ].sort(),
    );
    expect(SOUND_LIBRARY.find((s) => s.id === DEFAULT_SOUND_ID)?.isPremium).toBe(false);
    expect(SOUND_LIBRARY.filter((s) => !s.isPremium)).toHaveLength(3);
  });

  it.each(SOUND_LIBRARY.map((s) => [s.id, s] as const))(
    '%s: un vrai fichier WAV, de la duree annoncee',
    (_id, sound) => {
      const wav = readWav(sound.file);
      expect(wav).toMatchObject({ channels: 1, sampleRate: 44100, bitsPerSample: 16 });
      expect(Math.abs(wav.seconds - sound.duration)).toBeLessThan(0.1);
    },
  );

  it('versionne les adresses pour contourner le cache du mode hors ligne', () => {
    for (const s of SOUND_LIBRARY) expect(s.file).toMatch(/^\/sounds\/[a-z-]+\.wav\?v=\d+$/);
  });

  it('retombe sur le son par defaut pour un id inconnu ou absent', () => {
    expect(getSoundFile(null)).toBe(SOUND_LIBRARY[0].file);
    expect(getSoundFile('son-supprime')).toBe(SOUND_LIBRARY[0].file);
    expect(getSoundFile('zen-bowl')).toBe(SOUND_LIBRARY.find((s) => s.id === 'zen-bowl')?.file);
  });

  it('laisse passer un son personnalise envoye par le restaurant', () => {
    const url = 'https://exemple.supabase.co/storage/v1/object/public/sons/a.mp3';
    expect(isCustomSound(url)).toBe(true);
    expect(getSoundFile(url)).toBe(url);
  });
});
