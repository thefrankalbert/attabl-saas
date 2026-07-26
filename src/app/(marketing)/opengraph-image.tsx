import { ImageResponse } from 'next/og';

// Programmatic OpenGraph image (1200x630) shared by all marketing pages.
// Avoids shipping a static brand asset; rendered on demand and cached.
export const alt = 'Attabl - le restaurant digital, de A a Z';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#09090b',
        padding: '80px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '18px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#09090b',
            fontSize: '44px',
            fontWeight: 700,
          }}
        >
          A
        </div>
        <div style={{ color: '#fafafa', fontSize: '44px', fontWeight: 700, letterSpacing: '-1px' }}>
          Attabl
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div
          style={{
            color: '#fafafa',
            fontSize: '76px',
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-2px',
            maxWidth: '900px',
          }}
        >
          Le restaurant digital, de A a Z.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{ width: '44px', height: '6px', borderRadius: '3px', background: '#ea580c' }}
          />
          <div style={{ color: '#a1a1aa', fontSize: '30px' }}>
            Menu, caisse, cuisine, stock - pour restaurants et hotels
          </div>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
