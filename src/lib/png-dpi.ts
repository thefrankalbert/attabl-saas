/**
 * Injects a pHYs chunk into a PNG byte array to set physical pixel density metadata.
 *
 * Without this chunk, PNG files default to 72 DPI in most software, causing
 * print output to be ~4x larger than intended. This is essential for QR code
 * exports that need to print at the correct physical dimensions.
 *
 * @param pngBytes - Raw PNG bytes (must start with PNG signature)
 * @param dpi - Target DPI (e.g. 300 for print quality)
 * @returns New PNG bytes with pHYs chunk inserted after IHDR
 */
export function setPngDpi(pngBytes: Uint8Array, dpi: number): Uint8Array {
  const pixelsPerMeter = Math.round((dpi * 1000) / 25.4);

  const typeBytes = new TextEncoder().encode('pHYs');
  const data = new Uint8Array(9);
  const dataView = new DataView(data.buffer);
  dataView.setUint32(0, pixelsPerMeter, false);
  dataView.setUint32(4, pixelsPerMeter, false);
  data[8] = 1; // unit: meter

  const crcInput = new Uint8Array(4 + 9);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  const crc = crc32(crcInput);

  const chunk = new Uint8Array(21);
  const chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, 9, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  chunkView.setUint32(17, crc >>> 0, false);

  // Insert pHYs after IHDR: PNG signature(8) + IHDR length(4) + "IHDR"(4) + IHDR data(13) + IHDR CRC(4) = 33
  const insertAt = 33;
  const result = new Uint8Array(pngBytes.length + 21);
  result.set(pngBytes.slice(0, insertAt), 0);
  result.set(chunk, insertAt);
  result.set(pngBytes.slice(insertAt), insertAt + 21);
  return result;
}

/**
 * Converts a PNG data URL to a Blob with correct DPI metadata.
 * Use for download links instead of raw toDataURL() output.
 */
export function dataUrlToDpiBlob(dataUrl: string, dpi: number): Blob {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const withDpi = setPngDpi(bytes, dpi);
  return new Blob([withDpi.buffer as ArrayBuffer], { type: 'image/png' });
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Scale factor to apply to html2canvas for 300 DPI output from 96 DPI CSS layout */
export const PRINT_DPI = 300;
export const PRINT_SCALE = PRINT_DPI / 96; // ≈ 3.125
