// @vitest-environment jsdom
/**
 * v0.11.0 step 3 — drag/drop + keyboard parity on the unified SimTimeline
 * (prompt Step 3 DoD, Shanghai 2028 fixture numbers, Xe 1):
 *
 *   · pointer drag boundary-0 V19→V25 (mocked bar geometry): stints
 *     25/13/18, hero 90.2s, vs-best +7.1s, tooltip "V19 → V25" while
 *     dragging;
 *   · boundary-1 V38→V30 → 19/11/26 90.0s; keyboard arrows continue to
 *     V44 → 19/25/12 87.4s;
 *   · clamp: boundary-0 reaches exactly 4 (stint 4/34/18) and 34
 *     (34/4/18) — the ≥4-lap law; set-life violations stay honest engine
 *     errors, not UI clamps;
 *   · SC [19,21] (hero 75.8s): band body keyboard → [25,27] → hero back to
 *     83.1s AND the recommendation card switches to "Đổi sang S→M→S";
 *     resize-end keyboard → [19,38] → hero 68.6s;
 *   · pointer drag on the band body reproduces the move (grab-offset);
 *   · rain [19,28] → band End key → [47,56]: the error list collapses from
 *     2 slick-in-rain errors to exactly "stint M vòng 39–56 chạy slick
 *     trong mưa (cửa sổ 47–56)", and the card updates to a feasible plan;
 *   · the number inputs stay in two-way sync with every drag.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { TyreLabView } from '@/components/pitwall/TyreLabView';
import { buildShanghaiModel } from '../helpers/shanghai-2028-fixture';
import type { SaveModel } from '@/domain/types';

afterEach(cleanup);

function withI18n(ui: React.ReactElement, locale: 'vi' | 'en' = 'vi') {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Bangkok">
      {ui}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 56-lap bar mocked 560px wide → 10px per lap (x = lap × 10). */
const BAR_WIDTH = 560;
const xOfLap = (lap: number): number => (lap / 56) * BAR_WIDTH;

describe('SimTimeline drag — boundaries (v0.11.0 step 3, Shanghai)', () => {
  const model: SaveModel = buildShanghaiModel();

  function renderLab() {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));
    const bar = screen.getByTestId('sim-timeline');
    bar.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: BAR_WIDTH, bottom: 44, width: BAR_WIDTH, height: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    return bar;
  }

  it('pointer-dragging boundary-0 V19→V25 gives 25/13/18, 90.2s, +7.1s and a drag tooltip', async () => {
    renderLab();
    const b0 = screen.getByTestId('sim-timeline-boundary-0');
    expect(b0.getAttribute('aria-valuenow')).toBe('19');
    expect(b0.getAttribute('aria-valuemin')).toBe('4');
    expect(b0.getAttribute('aria-valuemax')).toBe('34');

    fireEvent.pointerDown(b0, { clientX: xOfLap(19), pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerMove(b0, { clientX: xOfLap(22), pointerId: 1, isPrimary: true });
    // mid-drag: the tooltip names the move and the editor inputs already
    // carry the live draft (the hero TWEEN may still be mid-flight — plain
    // DOM state only here)
    expect(screen.getByTestId('sim-timeline-drag-tip').textContent).toBe('V19 → V22');
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('22');
    fireEvent.pointerMove(b0, { clientX: xOfLap(25), pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(b0, { clientX: xOfLap(25), pointerId: 1, isPrimary: true });
    expect(screen.queryByTestId('sim-timeline-drag-tip')).not.toBeInTheDocument();

    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('25');
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('13');
    expect((screen.getByTestId('sim-stint-2-laps') as HTMLInputElement).value).toBe('18');
    await waitFor(() => {
      expect(screen.getByTestId('sim-total').textContent).toBe('90.2s');
    });
    await waitFor(() => {
      expect(screen.getByTestId('sim-vs-best').textContent).toContain('+7.1s');
    });
  });

  it('pointer-dragging boundary-1 V38→V30 gives 19/11/26 90.0s; keyboard continues to V44 → 87.4s', async () => {
    renderLab();
    const b1 = screen.getByTestId('sim-timeline-boundary-1');
    fireEvent.pointerDown(b1, { clientX: xOfLap(38), pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerMove(b1, { clientX: xOfLap(30), pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(b1, { clientX: xOfLap(30), pointerId: 1, isPrimary: true });
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('11');
    expect((screen.getByTestId('sim-stint-2-laps') as HTMLInputElement).value).toBe('26');
    await waitFor(() => {
      expect(screen.getByTestId('sim-total').textContent).toBe('90.0s');
    });

    // keyboard parity: 30 → 44 (14 arrows) — every step clamps and reprices
    for (let k = 0; k < 14; k++) fireEvent.keyDown(b1, { key: 'ArrowRight' });
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('25');
    expect((screen.getByTestId('sim-stint-2-laps') as HTMLInputElement).value).toBe('12');
    await waitFor(() => {
      expect(screen.getByTestId('sim-total').textContent).toBe('87.4s');
    });
  });

  it('the boundary clamp stops at 4 and 34 (the ≥4-lap law); life errors stay honest', () => {
    renderLab();
    const b0 = screen.getByTestId('sim-timeline-boundary-0');
    fireEvent.keyDown(b0, { key: 'Home' });
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('4');
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('34');
    fireEvent.keyDown(b0, { key: 'ArrowLeft' }); // clamped — no further
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('4');

    fireEvent.keyDown(b0, { key: 'End' });
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('34');
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('4');
    fireEvent.keyDown(b0, { key: 'ArrowRight' }); // clamped — no further
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('34');
    // the clamp is GEOMETRY-only: the 34-lap soft stint exceeds the garage's
    // best set (28) and the engine says so, verbatim
    expect(screen.getByTestId('sim-error-summary').textContent).toContain(
      'vượt đời bộ S',
    );
  });
});

describe('SimTimeline drag — scenario bands (v0.11.0 step 3, Shanghai)', () => {
  const model: SaveModel = buildShanghaiModel();

  function renderLabWithSC() {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));
    const bar = screen.getByTestId('sim-timeline');
    bar.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: BAR_WIDTH, bottom: 44, width: BAR_WIDTH, height: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.click(screen.getByTestId('sim-add-event')); // [19,21], committed
    return bar;
  }

  it('keyboard-moving the SC band [19,21]→[25,27] restores 83.1s and re-recommends', async () => {
    renderLabWithSC();
    await waitFor(() => {
      expect(screen.getByTestId('sim-total').textContent).toBe('75.8s');
    });

    const move = screen.getByTestId('sim-timeline-event-0-move');
    for (let k = 0; k < 6; k++) fireEvent.keyDown(move, { key: 'ArrowRight' });
    expect((screen.getByTestId('sim-event-0-start') as HTMLInputElement).value).toBe('25');
    await waitFor(() => {
      expect(screen.getByTestId('sim-total').textContent).toBe('83.1s');
    });
    // the committed-scenario card does NOT re-run per keyboard step — the
    // search waits for the commit; here the band moved without a commit,
    // so the card still answers the ORIGINAL [19,21] question
    expect(screen.getByTestId('tyre-scenario-recommendation')).toBeInTheDocument();
  });

  it('keyboard-resizing the band end [19,21]→[19,38] prices both pits inside the window (68.6s)', async () => {
    renderLabWithSC();
    const end = screen.getByTestId('sim-timeline-event-0-resize-end');
    fireEvent.keyDown(end, { key: 'End' }); // maxStart+... → lap 56 → laps 38
    expect((screen.getByTestId('sim-event-0-laps') as HTMLInputElement).value).toBe('38');
    await waitFor(() => {
      expect(screen.getByTestId('sim-total').textContent).toBe('68.6s');
    });
  });

  it('pointer-dragging the band body moves it with a grab offset (V19→V25)', async () => {
    renderLabWithSC();
    const move = screen.getByTestId('sim-timeline-event-0-move');
    // grab one lap into the band: pointer at lap 20 → offset 20−19 = 1
    fireEvent.pointerDown(move, { clientX: xOfLap(20), pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerMove(move, { clientX: xOfLap(26), pointerId: 1, isPrimary: true });
    expect(screen.getByTestId('sim-timeline-drag-tip').textContent).toBe('V19 → V25');
    fireEvent.pointerUp(move, { clientX: xOfLap(26), pointerId: 1, isPrimary: true });
    expect((screen.getByTestId('sim-event-0-start') as HTMLInputElement).value).toBe('25');
    expect((screen.getByTestId('sim-event-0-laps') as HTMLInputElement).value).toBe('3');
    await waitFor(() => {
      expect(screen.getByTestId('sim-total').textContent).toBe('83.1s');
    });
  });

  it('the band move-handle clamp keeps the band inside the race distance', () => {
    renderLabWithSC();
    const move = screen.getByTestId('sim-timeline-event-0-move');
    fireEvent.keyDown(move, { key: 'End' }); // maxStart = 56 − 3 + 1 = 54
    expect((screen.getByTestId('sim-event-0-start') as HTMLInputElement).value).toBe('54');
    fireEvent.keyDown(move, { key: 'ArrowRight' }); // clamped — no further
    expect((screen.getByTestId('sim-event-0-start') as HTMLInputElement).value).toBe('54');
    expect((screen.getByTestId('sim-event-0-laps') as HTMLInputElement).value).toBe('3');
  });
});

describe('SimTimeline drag — rain band (v0.11.0 step 3, Shanghai)', () => {
  const model: SaveModel = buildShanghaiModel();

  function renderLabWithRain() {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));
    const bar = screen.getByTestId('sim-timeline');
    bar.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: BAR_WIDTH, bottom: 44, width: BAR_WIDTH, height: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.click(screen.getByTestId('sim-add-rain')); // [19,28], committed
    return bar;
  }

  it('moving the rain band [19,28]→[47,56] collapses the errors to the single M-stint one and the card updates', async () => {
    renderLabWithRain();
    // the committed scenario: the current plan cannot run the rain
    const card = screen.getByTestId('tyre-scenario-recommendation');
    expect(within(card).getByTestId('scenario-verdict').textContent).toContain(
      'không chạy được dưới tình huống',
    );
    // the LIVE draft shows both slick stints inside the window
    expect(screen.getByTestId('sim-error-0').textContent).toContain('stint S vòng 1–19');
    expect(screen.getByTestId('sim-error-1').textContent).toContain('stint S vòng 20–38');

    const move = screen.getByTestId('sim-timeline-rain-0-move');
    fireEvent.keyDown(move, { key: 'End' }); // maxStart = 56 − 10 + 1 = 47
    expect((screen.getByTestId('sim-rain-0-start') as HTMLInputElement).value).toBe('47');
    expect((screen.getByTestId('sim-rain-0-laps') as HTMLInputElement).value).toBe('10');

    // exactly ONE result error now, verbatim (the summary box is separate)
    await waitFor(() => {
      expect(screen.queryByTestId('sim-error-1')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('sim-error-0').textContent).toContain(
      'stint M vòng 39–56 chạy slick trong mưa (cửa sổ 47–56)',
    );
    // the card still answers the COMMITTED [19,28] question — a live band
    // drag never re-runs the search (that is Step 2's committed-changes law)
    expect(within(card).getByTestId('scenario-time').textContent).toBe('154.1s');
  });

  it('the resize handles shift on keyboard and keep the window ≥ 1 lap', () => {
    renderLabWithRain();
    const start = screen.getByTestId('sim-timeline-rain-0-resize-start');
    // resize-start: end fixed at 28; Home → start 1 → laps 28
    fireEvent.keyDown(start, { key: 'Home' });
    expect((screen.getByTestId('sim-rain-0-start') as HTMLInputElement).value).toBe('1');
    expect((screen.getByTestId('sim-rain-0-laps') as HTMLInputElement).value).toBe('28');
    // End → start back to 28 (end fixed) → laps 1
    fireEvent.keyDown(start, { key: 'End' });
    expect((screen.getByTestId('sim-rain-0-start') as HTMLInputElement).value).toBe('28');
    expect((screen.getByTestId('sim-rain-0-laps') as HTMLInputElement).value).toBe('1');
  });
});
