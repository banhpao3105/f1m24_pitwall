// @vitest-environment jsdom
/**
 * v0.11.0 — the ONE scenario workspace (prompt Step 2 DoD, Shanghai 2028
 * fixture = the owner-verified autosave-5.sav numbers, Xe 1):
 *
 *   · `tyre-whatif` / `tyre-whatif-sc` are GONE from the DOM; the simulator
 *     keeps its editor + testids;
 *   · SC [25,27] → the recommendation card shows the SEARCH result the old
 *     top-6 card could never see: S→M→S, pit 25/38, 80.2s, delta −2.9s,
 *     "Đổi sang…" — Apply rewrites the editor to 25/13/18, hero 80.2s;
 *   · rain [19,28] → S18/I10/S28 154.1s + the infeasible verdict; the two
 *     alternates price 157.9s and 164.6s; applying alternate 0 → editor
 *     18/11/27, hero 157.9s;
 *   · the whole-pit-shift slider +2 → every pit at V21/V40 (the timeline
 *     flags move with the draft);
 *   · the scenario summary chip names the window ("SC V25–27" / "Mưa
 *     V19–28").
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

describe('TyreLabView — one scenario workspace (v0.11.0, Shanghai)', () => {
  const model: SaveModel = buildShanghaiModel();

  function renderLab() {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));
    expect(screen.queryByTestId('tyre-whatif')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tyre-whatif-sc')).not.toBeInTheDocument();
    expect(screen.getByTestId('tyre-simulator')).toBeInTheDocument();
  }

  function setEventStart(lap: number) {
    // typed input: the draft updates per keystroke, the SCENARIO commits on
    // blur — the card only re-searches on committed changes
    fireEvent.change(screen.getByTestId('sim-event-0-start'), { target: { value: String(lap) } });
    fireEvent.blur(screen.getByTestId('sim-event-0-start'));
  }

  it('SC [25,27]: the card finds S→M→S pit 25/38 80.2s (−2.9s) — Apply rewrites the editor', async () => {
    renderLab();
    // default add-event window = the draft's first pit [19,21]
    fireEvent.click(screen.getByTestId('sim-add-event'));
    setEventStart(25);

    const card = screen.getByTestId('tyre-scenario-recommendation');
    expect(within(card).getByTestId('scenario-summary').textContent).toContain('SC V25–27');
    const verdict = within(card).getByTestId('scenario-verdict').textContent ?? '';
    expect(verdict).toContain('Đổi sang S→M→S, pit V25/V38');
    expect(verdict).toContain('tiết kiệm 2.9s');
    expect(within(card).getByTestId('scenario-time').textContent).toBe('80.2s');
    expect(within(card).getByTestId('scenario-delta').textContent).toBe('−2.9s');

    fireEvent.click(within(card).getByTestId('scenario-apply'));
    await waitFor(() => {
      expect(screen.getAllByTestId('sim-stint-0-laps').length).toBe(1);
    });
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('25');
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('13');
    expect((screen.getByTestId('sim-stint-2-laps') as HTMLInputElement).value).toBe('18');
    expect(screen.getByTestId('sim-total').textContent).toBe('80.2s');
    // the timeline redraws the applied plan over the same lap axis
    expect(screen.getByTestId('sim-timeline-seg-0').textContent).toContain('S·25');
    expect(screen.getByTestId('sim-timeline-seg-1').textContent).toContain('M·13');
    expect(screen.getByTestId('sim-timeline-seg-2').textContent).toContain('S·18');
  });

  it('rain [19,28]: S18/I10/S28 154.1s, infeasible verdict, alternates 157.9/164.6', async () => {
    renderLab();
    fireEvent.click(screen.getByTestId('sim-add-rain')); // default = first pit 19, 10 laps → [19,28]

    const card = screen.getByTestId('tyre-scenario-recommendation');
    expect(within(card).getByTestId('scenario-summary').textContent).toContain('Mưa V19–28');
    const verdict = within(card).getByTestId('scenario-verdict').textContent ?? '';
    expect(verdict).toContain('không chạy được dưới tình huống');
    expect(verdict).toContain('S→I→S, pit V18/V28');
    expect(within(card).getByTestId('scenario-time').textContent).toBe('154.1s');
    // no delta chip: the current plan cannot run — a delta would be a lie
    expect(within(card).queryByTestId('scenario-delta')).not.toBeInTheDocument();

    expect(within(card).getByTestId('scenario-alt-0').textContent).toContain('S→I→S');
    expect(within(card).getByTestId('scenario-alt-0').textContent).toContain('157.9s');
    expect(within(card).getByTestId('scenario-alt-1').textContent).toContain('S→I→M');
    expect(within(card).getByTestId('scenario-alt-1').textContent).toContain('164.6s');

    fireEvent.click(within(card).getByTestId('scenario-apply-alt-0'));
    await waitFor(() => {
      expect(screen.getAllByTestId('sim-stint-0-laps').length).toBe(1);
    });
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('18');
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('11');
    expect((screen.getByTestId('sim-stint-2-laps') as HTMLInputElement).value).toBe('27');
    expect(screen.getByTestId('sim-total').textContent).toBe('157.9s');
  });

  it('the whole-pit-shift slider +2 moves every pit to V21/V40', () => {
    renderLab();
    // default draft = the lead plan S19/S19/M18 → pits 19/38
    expect(screen.getByTestId('sim-timeline-pit-19')).toBeInTheDocument();
    expect(screen.getByTestId('sim-timeline-pit-38')).toBeInTheDocument();

    const slider = screen.getByTestId('sim-pit-shift');
    const thumb = within(slider.parentElement as HTMLElement).getByRole('slider');
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });

    // the applied label names the moved pits; the timeline flags moved too
    expect(screen.getByTestId('sim-pit-shift-block').textContent).toContain('V21/V40');
    expect(screen.getByTestId('sim-timeline-pit-21')).toBeInTheDocument();
    expect(screen.getByTestId('sim-timeline-pit-40')).toBeInTheDocument();
    expect(screen.queryByTestId('sim-timeline-pit-19')).not.toBeInTheDocument();
    // every stint keeps its ≥4-lap floor: 21/19/16
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('21');
    expect((screen.getByTestId('sim-stint-2-laps') as HTMLInputElement).value).toBe('16');
    expect(screen.getByTestId('sim-total-laps').textContent).toBe('Tổng: 56/56 vòng');
  });
});
