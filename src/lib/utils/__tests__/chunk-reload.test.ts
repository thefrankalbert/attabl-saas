import { describe, it, expect } from 'vitest';
import { isChunkLoadError } from '../chunk-reload';

describe('isChunkLoadError', () => {
  it('detects a ChunkLoadError by name', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: 'whatever' })).toBe(true);
  });

  it('detects the classic webpack "Loading chunk failed" message', () => {
    expect(isChunkLoadError(new Error('Loading chunk 493 failed. (missing: /_next/...)'))).toBe(
      true,
    );
  });

  it('detects the dynamic-import failure messages', () => {
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/app.js')),
    ).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(new Error('INSUFFICIENT_STOCK'))).toBe(false);
  });

  it('is null/undefined safe', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
  });
});
