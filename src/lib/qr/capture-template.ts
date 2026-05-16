/**
 * Preloads remote images as data URLs so html2canvas can capture them (CORS-safe).
 */
async function fetchImageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Invalid data URL'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('readAsDataURL failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts <img> and SVG <image> sources to inline data URLs before canvas capture.
 */
export async function preloadImagesForCapture(root: HTMLElement): Promise<void> {
  const elements: Array<HTMLImageElement | SVGImageElement> = [
    ...Array.from(root.querySelectorAll('img')),
    ...Array.from(root.querySelectorAll('image')),
  ];

  await Promise.all(
    elements.map(async (el) => {
      const href =
        el instanceof SVGImageElement
          ? (el.getAttribute('href') ?? el.getAttribute('xlink:href'))
          : el.src;
      if (!href || href.startsWith('data:')) {
        return;
      }
      try {
        const dataUrl = await fetchImageAsDataUrl(href);
        if (el instanceof SVGImageElement) {
          el.setAttribute('href', dataUrl);
          el.removeAttribute('xlink:href');
        } else {
          el.src = dataUrl;
          el.crossOrigin = 'anonymous';
        }
      } catch {
        // Keep original src if preload fails (logo may be omitted in export)
      }
    }),
  );
}

export type Html2CanvasFn = (
  element: HTMLElement,
  options: Record<string, unknown>,
) => Promise<HTMLCanvasElement>;

/**
 * Captures a DOM subtree with html2canvas after preloading images.
 */
export async function captureElementToCanvas(
  element: HTMLElement,
  html2canvas: Html2CanvasFn,
  options: Record<string, unknown> = {},
): Promise<HTMLCanvasElement> {
  await preloadImagesForCapture(element);
  return html2canvas(element, {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    ...options,
  });
}
