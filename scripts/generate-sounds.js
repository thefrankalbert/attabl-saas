#!/usr/bin/env node
/**
 * Generate notification sounds for ATTABL using WAV synthesis
 * Run: node scripts/generate-sounds.js
 *
 * Creates 10 short notification sounds in /public/sounds/
 * Each sound is a WAV file (universal browser support, no codec needed)
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'sounds');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Create a WAV file buffer from raw PCM samples
 */
function createWav(samples, sampleRate = SAMPLE_RATE) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(val * 32767), headerSize + i * 2);
  }

  return buffer;
}

/**
 * Generate a sine tone with envelope
 */
function sineWithEnvelope(
  freq,
  duration,
  attack = 0.02,
  decay = 0.1,
  sustain = 0.7,
  release = 0.2,
  volume = 0.6,
) {
  const totalSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(totalSamples);
  const attackSamples = Math.floor(SAMPLE_RATE * attack);
  const decaySamples = Math.floor(SAMPLE_RATE * decay);
  const releaseSamples = Math.floor(SAMPLE_RATE * release);
  const sustainEnd = totalSamples - releaseSamples;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    let envelope = 0;

    if (i < attackSamples) {
      envelope = i / attackSamples;
    } else if (i < attackSamples + decaySamples) {
      envelope = 1 - (1 - sustain) * ((i - attackSamples) / decaySamples);
    } else if (i < sustainEnd) {
      envelope = sustain;
    } else {
      envelope = sustain * (1 - (i - sustainEnd) / releaseSamples);
    }

    samples[i] = Math.sin(2 * Math.PI * freq * t) * envelope * volume;
  }

  return samples;
}

/**
 * Mix multiple sample arrays together
 */
function mix(...arrays) {
  const maxLen = Math.max(...arrays.map((a) => a.length));
  const result = new Float64Array(maxLen);
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) {
      result[i] += arr[i];
    }
  }
  // Normalize
  let max = 0;
  for (let i = 0; i < result.length; i++) {
    max = Math.max(max, Math.abs(result[i]));
  }
  if (max > 1) {
    for (let i = 0; i < result.length; i++) {
      result[i] /= max;
    }
  }
  return result;
}

/**
 * Offset samples by a number of silent samples
 */
function offset(samples, delaySamples) {
  const result = new Float64Array(samples.length + delaySamples);
  for (let i = 0; i < samples.length; i++) {
    result[i + delaySamples] = samples[i];
  }
  return result;
}

// ─── Sound Definitions ──────────────────────────────────

const sounds = {
  // 1. Classic Bell — clear single bell tone
  'classic-bell': () => {
    const fundamental = sineWithEnvelope(880, 0.8, 0.005, 0.1, 0.3, 0.5, 0.6);
    const harmonic = sineWithEnvelope(1760, 0.6, 0.005, 0.08, 0.15, 0.4, 0.2);
    const high = sineWithEnvelope(2640, 0.4, 0.005, 0.06, 0.05, 0.3, 0.1);
    return mix(fundamental, harmonic, high);
  },

  // 2. Gentle Chime — two-note chime
  'gentle-chime': () => {
    const note1 = sineWithEnvelope(1047, 0.6, 0.01, 0.1, 0.3, 0.3, 0.5);
    const note2 = offset(
      sineWithEnvelope(1319, 0.6, 0.01, 0.1, 0.3, 0.3, 0.5),
      Math.floor(SAMPLE_RATE * 0.15),
    );
    return mix(note1, note2);
  },

  // 3. Simple Ding — short and sweet
  'simple-ding': () => {
    return sineWithEnvelope(1200, 0.5, 0.003, 0.05, 0.2, 0.3, 0.6);
  },

  // 4. Elegant Tone — rich multi-harmonic tone
  'elegant-tone': () => {
    const f1 = sineWithEnvelope(523, 1.5, 0.02, 0.2, 0.4, 0.8, 0.5);
    const f2 = sineWithEnvelope(659, 1.3, 0.02, 0.15, 0.3, 0.7, 0.3);
    const f3 = sineWithEnvelope(784, 1.0, 0.02, 0.1, 0.2, 0.5, 0.2);
    return mix(f1, f2, f3);
  },

  // 5. Crystal Bell — high, pure bell sound
  'crystal-bell': () => {
    const f1 = sineWithEnvelope(2093, 1.0, 0.002, 0.05, 0.15, 0.7, 0.5);
    const f2 = sineWithEnvelope(4186, 0.6, 0.002, 0.03, 0.05, 0.4, 0.2);
    const sub = sineWithEnvelope(1047, 0.8, 0.005, 0.1, 0.2, 0.5, 0.3);
    return mix(f1, f2, sub);
  },

  // 6. Soft Marimba — warm wooden percussive tone
  'soft-marimba': () => {
    const note1 = sineWithEnvelope(440, 0.5, 0.002, 0.08, 0.1, 0.3, 0.6);
    const note2 = offset(
      sineWithEnvelope(554, 0.5, 0.002, 0.08, 0.1, 0.3, 0.5),
      Math.floor(SAMPLE_RATE * 0.2),
    );
    const note3 = offset(
      sineWithEnvelope(659, 0.5, 0.002, 0.08, 0.1, 0.3, 0.4),
      Math.floor(SAMPLE_RATE * 0.4),
    );
    return mix(note1, note2, note3);
  },

  // 7. Zen Bowl — long resonating singing bowl
  'zen-bowl': () => {
    const f1 = sineWithEnvelope(220, 2.0, 0.1, 0.3, 0.5, 1.0, 0.4);
    const f2 = sineWithEnvelope(440, 1.8, 0.08, 0.2, 0.3, 0.8, 0.3);
    const f3 = sineWithEnvelope(660, 1.5, 0.06, 0.15, 0.2, 0.6, 0.15);
    return mix(f1, f2, f3);
  },

  // 8. Luxury Chime — ascending 3-note chord
  'luxury-chime': () => {
    const note1 = sineWithEnvelope(784, 0.8, 0.01, 0.1, 0.3, 0.4, 0.5);
    const note2 = offset(
      sineWithEnvelope(988, 0.8, 0.01, 0.1, 0.3, 0.4, 0.5),
      Math.floor(SAMPLE_RATE * 0.15),
    );
    const note3 = offset(
      sineWithEnvelope(1175, 1.0, 0.01, 0.15, 0.4, 0.5, 0.5),
      Math.floor(SAMPLE_RATE * 0.3),
    );
    return mix(note1, note2, note3);
  },

  // 9. Wooden Knock — short percussive knock
  'wooden-knock': () => {
    const totalSamples = Math.floor(SAMPLE_RATE * 0.6);
    const samples = new Float64Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t * 25);
      // Mix of frequencies for wood-like character
      samples[i] =
        env *
        0.6 *
        (0.5 * Math.sin(2 * Math.PI * 400 * t) +
          0.3 * Math.sin(2 * Math.PI * 800 * t) +
          0.15 * Math.sin(2 * Math.PI * 1200 * t) +
          0.1 * (Math.random() * 2 - 1) * Math.exp(-t * 50)); // noise burst
    }
    return samples;
  },

  // 10. Brass Bell — traditional service bell
  'brass-bell': () => {
    const totalSamples = Math.floor(SAMPLE_RATE * 1.0);
    const samples = new Float64Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t * 3);
      // Bell-like spectrum with slight inharmonicity
      samples[i] =
        env *
        0.5 *
        (0.5 * Math.sin(2 * Math.PI * 523 * t) +
          0.35 * Math.sin(2 * Math.PI * 1047 * t * 1.003) +
          0.2 * Math.sin(2 * Math.PI * 1568 * t * 0.998) +
          0.1 * Math.sin(2 * Math.PI * 2093 * t * 1.005));
    }
    return samples;
  },
};

// ─── Generate all sounds ────────────────────────────────

console.log('Generating notification sounds...\n');

for (const [name, generator] of Object.entries(sounds)) {
  const samples = generator();
  // Convert Float64Array to regular array for createWav
  const samplesArray = Array.from(samples);
  const wavBuffer = createWav(samplesArray);

  // Save as .mp3 extension but WAV content (browsers play both)
  // Actually let's use .mp3 extension for consistency with the library definition
  const filePath = path.join(OUTPUT_DIR, `${name}.mp3`);
  fs.writeFileSync(filePath, wavBuffer);

  const sizeKB = (wavBuffer.length / 1024).toFixed(1);
  const durationSec = (samples.length / SAMPLE_RATE).toFixed(1);
  console.log(`  ✓ ${name}.mp3 (${sizeKB} KB, ${durationSec}s)`);
}

console.log(`\nDone! ${Object.keys(sounds).length} sounds generated in ${OUTPUT_DIR}`);
