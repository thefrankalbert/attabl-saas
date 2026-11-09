// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render, screen, act } from '@testing-library/react';
import { useMinuteClock } from '../useMinuteClock';

function Probe() {
  const now = useMinuteClock();
  return <span data-testid="now">{now === null ? 'null' : String(now)}</span>;
}

describe('useMinuteClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders null on the server, so SSR HTML never carries a clock value', () => {
    expect(renderToString(<Probe />)).toContain('null');
  });

  it('gives the current minute on the client and ticks every minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T13:49:30Z'));
    render(<Probe />);
    expect(screen.getByTestId('now').textContent).toBe(String(Date.parse('2026-11-09T13:49:00Z')));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('now').textContent).toBe(String(Date.parse('2026-11-09T13:50:00Z')));
  });
});
