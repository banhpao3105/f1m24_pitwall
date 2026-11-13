// @vitest-environment jsdom
/**
 * Phase 3 motion tests — NumberTween (docs/06 §6.4): renders the value,
 * no animation on mount, respects prefers-reduced-motion (instant update).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NumberTween } from '@/components/pitwall/NumberTween';

afterEach(cleanup);

function setReducedMotion(value: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? value : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('NumberTween', () => {
  it('renders the formatted value immediately on mount (no first-paint animation)', () => {
    render(<NumberTween value={43} format={(n) => `${Math.round(n)} pts`} />);
    expect(screen.getByTestId('number-tween')).toHaveTextContent('43 pts');
  });

  it('updates to the new value after a change (spring settles)', async () => {
    setReducedMotion(true); // instant jump path — deterministic in jsdom
    const { rerender } = render(<NumberTween value={10} format={(n) => `#${Math.round(n)}`} />);
    expect(screen.getByTestId('number-tween')).toHaveTextContent('#10');
    rerender(<NumberTween value={3} format={(n) => `#${Math.round(n)}`} />);
    await waitFor(() => {
      expect(screen.getByTestId('number-tween')).toHaveTextContent('#3');
    });
  });

  it('applies the className for token styling', () => {
    render(<NumberTween value={5} className="text-amber" />);
    const el = screen.getByTestId('number-tween');
    expect(el).toHaveClass('text-amber');
  });
});
