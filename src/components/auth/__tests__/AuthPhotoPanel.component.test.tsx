// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * Photo side of the auth frame: fixed photo or slideshow, pause, reduced
 * motion, and the "check your inbox" override. The panel keeps its position in
 * module-level memory, so every test loads a fresh copy of the modules.
 */

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
}));
vi.mock('next/image', () => ({
  default: ({ src, className }: { src: string; className?: string }) => (
    <span data-photo={src} className={className} />
  ),
}));

type Panel = typeof import('../AuthPhotoPanel');
type Scenes = typeof import('../auth-scenes');

let reducedMotion = false;

async function load(): Promise<Panel & Scenes> {
  vi.resetModules();
  const panel = await import('../AuthPhotoPanel');
  const scenes = await import('../auth-scenes');
  return { ...panel, ...scenes };
}

function activePhoto(): string | null {
  const active = [...document.querySelectorAll('[data-photo]')].filter((el) =>
    el.className.includes('opacity-100'),
  );
  expect(active).toHaveLength(1);
  return active[0].getAttribute('data-photo');
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  reducedMotion = false;
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reducedMotion,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AuthPhotoPanel', () => {
  it('shows one fixed photo, its sentence and no pause button on a secondary screen', async () => {
    const { AuthPhotoPanel } = await load();
    render(<AuthPhotoPanel scene="forgot" />);

    expect(document.querySelectorAll('[data-photo]')).toHaveLength(1);
    expect(activePhoto()).toBe('/auth/cnx-patisserie.webp');
    expect(screen.getByText('phrases.forgot')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    tick(20_000);
    expect(activePhoto()).toBe('/auth/cnx-patisserie.webp');
  });

  it('moves to the next photo every 6 seconds, in the order of the brief', async () => {
    const { AuthPhotoPanel } = await load();
    render(<AuthPhotoPanel scene="login" />);

    expect(activePhoto()).toBe('/auth/cnx-accueil.webp');
    tick(5_900);
    expect(activePhoto()).toBe('/auth/cnx-accueil.webp');
    tick(200);
    expect(activePhoto()).toBe('/auth/cnx-cuisine.webp');
    tick(6_000 * 5);
    // 6 photos: after 6 steps the slideshow is back on the first one.
    expect(activePhoto()).toBe('/auth/cnx-accueil.webp');
  });

  it('requests each photo one slide ahead, never all six at once', async () => {
    const { AuthPhotoPanel } = await load();
    render(<AuthPhotoPanel scene="login" />);

    expect(document.querySelectorAll('[data-photo]')).toHaveLength(2);
    tick(6_000);
    expect(document.querySelectorAll('[data-photo]')).toHaveLength(3);
  });

  it('pauses and resumes with an accessible button', async () => {
    const { AuthPhotoPanel } = await load();
    render(<AuthPhotoPanel scene="login" />);

    fireEvent.click(screen.getByRole('button', { name: 'pause' }));
    expect(screen.getByRole('button', { name: 'play' })).toBeInTheDocument();
    tick(20_000);
    expect(activePhoto()).toBe('/auth/cnx-accueil.webp');

    fireEvent.click(screen.getByRole('button', { name: 'play' }));
    tick(6_000);
    expect(activePhoto()).toBe('/auth/cnx-cuisine.webp');
  });

  it('keeps its photo when the visitor goes from login to signup', async () => {
    const { AuthPhotoPanel } = await load();
    const login = render(<AuthPhotoPanel scene="login" />);
    tick(12_000);
    expect(activePhoto()).toBe('/auth/cnx-service.webp');
    login.unmount();

    render(<AuthPhotoPanel scene="signup" />);
    expect(activePhoto()).toBe('/auth/cnx-service.webp');
    expect(screen.getByText('phrases.signup')).toBeInTheDocument();
  });

  it('does not slide and shows no button when the visitor asked for reduced motion', async () => {
    reducedMotion = true;
    const { AuthPhotoPanel } = await load();
    render(<AuthPhotoPanel scene="login" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    tick(20_000);
    expect(document.querySelectorAll('[data-photo]')).toHaveLength(1);
    expect(activePhoto()).toBe('/auth/cnx-accueil.webp');
  });

  it('lets the "check your inbox" screen replace the photo and the sentence', async () => {
    const { AuthPhotoPanel, setAuthSceneOverride } = await load();
    render(<AuthPhotoPanel scene="signup" />);

    act(() => setAuthSceneOverride('confirm'));
    expect(activePhoto()).toBe('/auth/cnx-salle.webp');
    expect(screen.getByText('phrases.confirm')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    act(() => setAuthSceneOverride(null));
    expect(screen.getByText('phrases.signup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pause' })).toBeInTheDocument();
  });

  it('clears its timer when it leaves the page', async () => {
    const { AuthPhotoPanel } = await load();
    const view = render(<AuthPhotoPanel scene="login" />);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
