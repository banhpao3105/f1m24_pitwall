// @vitest-environment jsdom
/**
 * v0.9.7 — the "Mô phỏng tự do" sandbox inside Tyre Lab (prompt §3.4, on
 * the Shanghai 2028 fixture — every number flows through priceManualPlan):
 *
 *   · the section renders AFTER the three old what-if sections and the
 *     default stints are a copy of the LEAD plan (S19/S19/M18);
 *   · editing stints 2/3 to M18/M19 reproduces B1 exactly: 100.4s, the
 *     plan line "S(19) → M(18) → M(19)", the assigned sets (#3 fresh,
 *     #7 used);
 *   · rain [29,39] + S28/I11/S17 reproduces B3: 160.2s;
 *   · M18 back over the rain window surfaces BOTH B4 engine errors
 *     verbatim (the UI never re-translates engine strings);
 *   · B1 + an SC[19,21] event reproduces B8: 93.2s.
 *
 * v0.9.9 — the editor-friendliness pass (UI only, engine untouched): live
 * per-stint lap ranges + the live lap total, titled/labelled lists, the
 * dimmed last-good result while the draft errors, sensible add defaults
 * (first pit, not lap 1), the reset button, and the race-distance rain cap.
 *
 * v0.10.0 step 1 — the simulator's face (UI only, engine untouched): the
 * SimTimeline (draft stints over the real lap axis with SC/VSC + rain
 * bands, clickable segments, text tooltip) and the hero total (NumberTween
 * + sign-coloured vs-best chip). Motion runs reduced (stubbed here) so
 * every spring takes its instant-jump branch in jsdom.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
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
  // v0.10.0 step 1 — the hero total now tweens via NumberTween and the
  // SimTimeline segments use layout springs; springs settle over real time
  // (rAF), which jsdom never reaches. Stub matchMedia to reduced-motion so
  // every motion path takes its instant-jump branch (mv.jump / duration 0)
  // — deterministic assertions, same branch real reduced-motion users get.
  // NOTE: motion-dom queries window.matchMedia("(prefers-reduced-motion)")
  // (no ": reduce" suffix) — match the family, not the exact media query.
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
  // jsdom does not implement scrollIntoView (the timeline's click-through
  // scrolls the editor row into view).
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setCompound(index: number, value: string): void {
  // v0.10.0 step 2 — the compound select became a segmented control; the
  // testid lives on the GROUP and each compound is a pressed button.
  fireEvent.click(
    within(screen.getByTestId(`sim-stint-${index}-compound`)).getByRole('button', {
      name: value,
    }),
  );
}

/** v0.10.0 step 2 — the pressed compound of a row's segmented control. */
function compoundPressed(index: number, value: string): boolean {
  return (
    within(screen.getByTestId(`sim-stint-${index}-compound`)).getByRole('button', { name: value })
      .getAttribute('aria-pressed') === 'true'
  );
}

function setLaps(index: number, value: number): void {
  fireEvent.change(screen.getByTestId(`sim-stint-${index}-laps`), {
    target: { value: String(value) },
  });
}

describe('TyreLabView — the free-form simulator (v0.9.7, Shanghai save)', () => {
  const model: SaveModel = buildShanghaiModel();

  it('the sandbox renders after the what-if sections with the lead plan as its default stints', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    const sim = screen.getByTestId('tyre-simulator');
    expect(sim).toBeInTheDocument();
    // the default car picker: Xe 1 pressed, both inventory cars present
    expect(screen.getByTestId('sim-car-0').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('sim-car-0').textContent).toBe('Xe 1');
    expect(screen.getByTestId('sim-car-1').textContent).toBe('Xe 2');
    // default stints = the LEAD plan S19/S19/M18 (segmented compound)
    expect(compoundPressed(0, 'S')).toBe(true);
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('19');
    expect(compoundPressed(1, 'S')).toBe(true);
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('19');
    expect(compoundPressed(2, 'M')).toBe(true);
    expect((screen.getByTestId('sim-stint-2-laps') as HTMLInputElement).value).toBe('18');
  });

  // v0.9.9 step 1 — the lead plan IS the best on this fixture, so vsBestS is
  // exactly 0: the tie renders "bằng best", and no signed "−0.0s" survives
  // anywhere inside the simulator section.
  it('a plan TIED with best renders the tie string — never "−0.0s"', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    const sim = screen.getByTestId('tyre-simulator');
    expect(screen.getByTestId('sim-vs-best').textContent).toBe('bằng best');
    expect(within(sim).queryAllByText(/−0\.0s/)).toHaveLength(0);
  });

  it('B1 via the builder: S19/M18/M19 → 100.4s · plan line · #3 fresh / #7 used sets', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    setCompound(1, 'M');
    setLaps(1, 18);
    setCompound(2, 'M');
    setLaps(2, 19);

    expect(screen.getByTestId('sim-total').textContent).toBe('100.4s');
    expect(screen.getByTestId('sim-plan-line').textContent).toBe(
      'S(19) → M(18) → M(19) — 2 pit (V19, V37)',
    );
    const result = screen.getByTestId('simulator-result');
    expect(within(result).getByText('bộ #3 · mới · đời 28')).toBeInTheDocument();
    expect(within(result).getByText('bộ #7 · đã dùng · đời 37')).toBeInTheDocument();
    expect(within(result).getByText('bộ #9 · mới · đời 42')).toBeInTheDocument();
    // vsBest against the lab best (83.1)
    expect(screen.getByTestId('sim-vs-best').textContent).toBe('+17.3s so với best');
    // the wear line reuses the card's own key
    expect(screen.getByTestId('sim-wear').textContent).toBe('mòn lốp: −0.4s');
  });

  it('B3 via the builder: rain [29,39] + S28/I11/S17 → 160.2s with the two wet assumptions', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    fireEvent.click(screen.getByTestId('sim-add-rain'));
    fireEvent.change(screen.getByTestId('sim-rain-0-start'), { target: { value: '29' } });
    fireEvent.change(screen.getByTestId('sim-rain-0-laps'), { target: { value: '11' } });
    setLaps(0, 28);
    setCompound(1, 'I');
    setLaps(1, 11);
    setCompound(2, 'S');
    setLaps(2, 17);

    expect(screen.getByTestId('sim-total').textContent).toBe('160.2s');
    const assumptions = screen.getByTestId('sim-assumptions');
    expect(assumptions.textContent).toContain(
      'pace I/W = ELT trung vị toàn trường của game cho lốp mưa (pace trên đường ướt theo game, không phải số đo practice)',
    );
    expect(assumptions.textContent).toContain(
      'deg I/W mượn curve của M (save không có hằng số deg cho lốp mưa — giả định gán nhãn)',
    );
    // the I stint sits INSIDE the rain window — no dry-under-wet caveat
    expect(assumptions.textContent).not.toContain('chạy trên khô');
  });

  it('B4 via the builder: M18 over the rain window → BOTH engine errors verbatim', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    fireEvent.click(screen.getByTestId('sim-add-rain'));
    fireEvent.change(screen.getByTestId('sim-rain-0-start'), { target: { value: '29' } });
    fireEvent.change(screen.getByTestId('sim-rain-0-laps'), { target: { value: '11' } });
    setLaps(0, 28);
    setCompound(1, 'I');
    setLaps(1, 11);
    setLaps(2, 17);
    // back to S19/M18/S19 over the rain window
    setLaps(0, 19);
    setCompound(1, 'M');
    setLaps(1, 18);
    setCompound(2, 'S');
    setLaps(2, 19);

    expect(screen.getByTestId('sim-error-0').textContent).toBe(
      'stint M vòng 20–37 chạy slick trong mưa (cửa sổ 29–39)',
    );
    expect(screen.getByTestId('sim-error-1').textContent).toBe(
      'stint S vòng 38–56 chạy slick trong mưa (cửa sổ 29–39)',
    );
  });

  it('B8 via the builder: B1 + an SC[19,21] event → 93.2s', async () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    // restore B1 (S19/M18/M19), rain removed
    setCompound(1, 'M');
    setLaps(1, 18);
    setCompound(2, 'M');
    setLaps(2, 19);
    fireEvent.click(screen.getByTestId('sim-add-rain'));
    fireEvent.change(screen.getByTestId('sim-rain-0-start'), { target: { value: '29' } });
    fireEvent.change(screen.getByTestId('sim-rain-0-laps'), { target: { value: '11' } });
    fireEvent.click(screen.getByTestId('sim-rain-0-delete'));
    // the SC event [19,21]
    fireEvent.click(screen.getByTestId('sim-add-event'));
    fireEvent.change(screen.getByTestId('sim-event-0-start'), { target: { value: '19' } });
    fireEvent.change(screen.getByTestId('sim-event-0-laps'), { target: { value: '3' } });

    // this transition re-prices a PERSISTING result (no remount in between),
    // so the hero text flows through framer-motion's frame loop even in the
    // instant-jump path — waitFor it (same pattern as phase3-motion).
    await waitFor(() => {
      expect(screen.getByTestId('sim-total').textContent).toBe('93.2s');
    });
    expect(screen.getByTestId('sim-vs-best').textContent).toBe('+10.1s so với best');
  });

  it('the car switch re-prices on the other garage without touching the stints', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    setCompound(1, 'M');
    setLaps(1, 18);
    setCompound(2, 'M');
    setLaps(2, 19);
    expect(screen.getByTestId('sim-total').textContent).toBe('100.4s');

    fireEvent.click(screen.getByTestId('sim-car-1'));
    expect(screen.getByTestId('sim-car-1').getAttribute('aria-pressed')).toBe('true');
    // same stints, re-priced on car 2's identical garage → identical number
    expect(screen.getByTestId('sim-total').textContent).toBe('100.4s');
    expect(compoundPressed(0, 'S')).toBe(true);
    expect(compoundPressed(1, 'M')).toBe(true);
  });
});

describe('TyreLabView — the simulator editor (v0.9.9, Shanghai save)', () => {
  const model: SaveModel = buildShanghaiModel();

  it('each stint row shows its live lap range, the total line reads 56/56, and the two lists have titles + empty hints', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    // S19/S19/M18 → V1–19 · V20–38 · V39–56
    expect(screen.getByTestId('sim-stint-0-range').textContent).toBe('V1–19');
    expect(screen.getByTestId('sim-stint-1-range').textContent).toBe('V20–38');
    expect(screen.getByTestId('sim-stint-2-range').textContent).toBe('V39–56');
    // the live total, neutral at exactly the race distance
    const total = screen.getByTestId('sim-total-laps');
    expect(total.textContent).toBe('Tổng: 56/56 vòng');
    expect(total.className).not.toContain('text-danger');
    // titled lists with a hint while empty
    expect(screen.getByText('Sự kiện SC/VSC')).toBeInTheDocument();
    expect(screen.getByText('Cửa sổ mưa')).toBeInTheDocument();
    expect(screen.getByTestId('sim-events-empty')).toBeInTheDocument();
    expect(screen.getByTestId('sim-rain-empty')).toBeInTheDocument();
    // the sandbox's one-line contract (v0.9.9 step 3)
    expect(screen.getByTestId('sim-subtitle').textContent).toBe(
      'Tự ráp chiến thuật, chèn SC/VSC và mưa — chỉ so với plan tốt nhất, không đổi lead/trail.',
    );
    // the tie from step 1 still holds on the default draft
    expect(screen.getByTestId('sim-vs-best').textContent).toBe('bằng best');
  });

  it('an invalid total shows the red total + the engine banner AND keeps the last valid result dimmed', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    setLaps(0, 10);

    // the ranges track the draft live: 10/19/18 → V1–10 · V11–29 · V30–47
    expect(screen.getByTestId('sim-stint-0-range').textContent).toBe('V1–10');
    expect(screen.getByTestId('sim-stint-1-range').textContent).toBe('V11–29');
    expect(screen.getByTestId('sim-stint-2-range').textContent).toBe('V30–47');

    // red total + the ENGINE's own error string, verbatim
    const total = screen.getByTestId('sim-total-laps');
    expect(total.textContent).toBe('Tổng: 47/56 vòng');
    expect(total.className).toContain('text-danger');
    expect(screen.getByTestId('sim-error-0').textContent).toBe(
      'tổng số vòng 47 ≠ 56 vòng của chặng',
    );

    // the last valid price survives: dimmed, with the stale note
    expect(screen.getByTestId('sim-stale-note')).toBeInTheDocument();
    const stale = screen.getByTestId('sim-stale-result');
    expect(stale.className).toContain('opacity-60');
    expect(within(stale).getByTestId('sim-total').textContent).toBe('83.1s');
    expect(within(stale).getByTestId('sim-plan-line').textContent).toBe(
      'S(19) → S(19) → M(18) — 2 pit (V19, V38)',
    );
  });

  it('a new SC/VSC event defaults to the draft first pit (19, 3 laps); a new rain window to (19, 10 laps) with the race-distance cap', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    fireEvent.click(screen.getByTestId('sim-add-event'));
    expect((screen.getByTestId('sim-event-0-start') as HTMLInputElement).value).toBe('19');
    expect((screen.getByTestId('sim-event-0-laps') as HTMLInputElement).value).toBe('3');
    // visible row labels (v0.9.9): "từ vòng" before start, "dài … vòng" around laps
    expect(screen.getByTestId('sim-event-row-0').textContent).toContain('từ vòng');
    expect(screen.getByTestId('sim-event-row-0').textContent).toContain('dài');
    expect(screen.getByTestId('sim-event-row-0').textContent).toContain('vòng');

    fireEvent.click(screen.getByTestId('sim-add-rain'));
    expect((screen.getByTestId('sim-rain-0-start') as HTMLInputElement).value).toBe('19');
    expect((screen.getByTestId('sim-rain-0-laps') as HTMLInputElement).value).toBe('10');
    // the cap is the race distance (56), NOT the old UI-only 20
    expect(screen.getByTestId('sim-rain-0-laps').getAttribute('max')).toBe('56');
    fireEvent.change(screen.getByTestId('sim-rain-0-laps'), { target: { value: '30' } });
    expect((screen.getByTestId('sim-rain-0-laps') as HTMLInputElement).value).toBe('30');
    // the wet hint appears with a window on screen
    expect(screen.getByTestId('sim-rain-hint').textContent).toBe(
      'Stint slick nào chạy trong cửa sổ mưa sẽ báo lỗi — đổi stint đó sang I hoặc W.',
    );
  });

  it('"Về plan lead" re-seeds the draft: lead stints, empty lists, 83.1s', async () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    // dirty the draft first
    setLaps(0, 10);
    fireEvent.click(screen.getByTestId('sim-add-event'));
    expect(screen.getByTestId('sim-event-0-start')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sim-reset'));

    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('19');
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('19');
    expect((screen.getByTestId('sim-stint-2-laps') as HTMLInputElement).value).toBe('18');
    // the removed row leaves through AnimatePresence's exit cycle (instant
    // under reduced motion, but still one frame) — waitFor the removal
    await waitFor(() => {
      expect(screen.queryByTestId('sim-event-0-start')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('sim-events-empty')).toBeInTheDocument();
    expect(screen.getByTestId('sim-total').textContent).toBe('83.1s');
    expect(screen.getByTestId('sim-vs-best').textContent).toBe('bằng best');
    expect(screen.getByTestId('sim-total-laps').textContent).toBe('Tổng: 56/56 vòng');
  });
});

describe('TyreLabView — SimTimeline + hero (v0.10.0 step 1, Shanghai save)', () => {
  const model: SaveModel = buildShanghaiModel();

  /* framer-motion renders % style values rounded to 4 decimals (e.g.
     17.8571%); the geometry assertions compare parsed numbers at 2-decimal
     precision — the visual difference is sub-thousandth of a percent. */
  const pctOf = (el: HTMLElement, prop: 'width' | 'left') => parseFloat(el.style[prop]);

  it('the draft timeline renders 3 segments at 19/19/18 of 56 with pit flags at V19/V38', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    const bar = screen.getByTestId('sim-timeline');
    expect(bar).toBeInTheDocument();
    const segs = [0, 1, 2].map((i) => screen.getByTestId(`sim-timeline-seg-${i}`));
    // widths exactly the laps share of the real axis: 19/19/18 of 56
    expect(pctOf(segs[0]!, 'width')).toBeCloseTo((19 / 56) * 100, 2);
    expect(pctOf(segs[1]!, 'width')).toBeCloseTo((19 / 56) * 100, 2);
    expect(pctOf(segs[2]!, 'width')).toBeCloseTo((18 / 56) * 100, 2);
    // in-segment labels: compound + length on line 1, lap range on line 2
    expect(segs[0]!.textContent).toContain('S·19');
    expect(segs[0]!.textContent).toContain('V1–19');
    expect(segs[2]!.textContent).toContain('V39–56');
    // pit flags at the two stint boundaries
    expect(screen.getByTestId('sim-timeline-pit-19')).toBeInTheDocument();
    expect(screen.getByTestId('sim-timeline-pit-38')).toBeInTheDocument();
  });

  it('hovering a priced segment shows a TEXT tooltip: compound, range, set, wear', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    const seg0 = screen.getByTestId('sim-timeline-seg-0');
    fireEvent.mouseEnter(seg0);
    const tip = screen.getByTestId('sim-timeline-tooltip');
    expect(tip.textContent).toContain('S · V1–19');
    expect(tip.textContent).toContain('bộ #3');
    expect(tip.textContent).toContain('mới');
    expect(tip.textContent).toContain('đời 28');
    fireEvent.mouseLeave(seg0);
    expect(screen.queryByTestId('sim-timeline-tooltip')).not.toBeInTheDocument();
    // focusing the segment (keyboard path) shows the same tooltip
    fireEvent.focus(seg0);
    expect(screen.getByTestId('sim-timeline-tooltip')).toBeInTheDocument();
    fireEvent.blur(seg0);
    expect(screen.queryByTestId('sim-timeline-tooltip')).not.toBeInTheDocument();
  });

  it('clicking a segment focuses that stint row in the editor and rings it', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
      render(withI18n(<TyreLabView model={model} raceId={212} />));

      fireEvent.click(screen.getByTestId('sim-timeline-seg-1'));

      // the row's laps input carries focus (keyboard users land in the editor)
      const laps1 = screen.getByTestId('sim-stint-1-laps');
      expect(document.activeElement).toBe(laps1);
      // the row shows the teal highlight ring…
      const row = screen.getByTestId('sim-stint-row-1');
      expect(row.className).toContain('ring-teal');
      // …and it switches off after 1.5s
      act(() => {
        vi.advanceTimersByTime(1600);
      });
      expect(row.className).not.toContain('ring-teal');
    } finally {
      vi.useRealTimers();
    }
  });

  it('an SC event and a rain window appear as bands over their exact lap ranges', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    // defaults from v0.9.9: SC at the draft's first pit (19) for 3 laps;
    // rain at 19 for 10 laps
    fireEvent.click(screen.getByTestId('sim-add-event'));
    const ev = screen.getByTestId('sim-timeline-event-0');
    expect(pctOf(ev, 'left')).toBeCloseTo((18 / 56) * 100, 2);
    expect(pctOf(ev, 'width')).toBeCloseTo((3 / 56) * 100, 2);

    fireEvent.click(screen.getByTestId('sim-add-rain'));
    const rw = screen.getByTestId('sim-timeline-rain-0');
    expect(pctOf(rw, 'left')).toBeCloseTo((18 / 56) * 100, 2);
    expect(pctOf(rw, 'width')).toBeCloseTo((10 / 56) * 100, 2);
  });

  it('the hero total is a tweened number and the vs-best chip is coloured by its sign', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    // the default draft TIES the best → teal chip, hero 83.1s
    expect(screen.getByTestId('sim-total').textContent).toBe('83.1s');
    expect(screen.getByTestId('sim-vs-best').className).toContain('text-teal');
    // hero glow — the one text-shadow in the section
    expect(screen.getByTestId('sim-total').getAttribute('style')).toContain('text-shadow');

    // B1 (100.4s) is slower than best → danger chip
    setCompound(1, 'M');
    setLaps(1, 18);
    setCompound(2, 'M');
    setLaps(2, 19);
    expect(screen.getByTestId('sim-total').textContent).toBe('100.4s');
    const chip = screen.getByTestId('sim-vs-best');
    expect(chip.textContent).toBe('+17.3s so với best');
    expect(chip.className).toContain('text-danger');
  });

  it('segments track the draft live when stint lengths change', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    setLaps(0, 10);
    // 10/19/18 on the same 56-lap axis; the boundaries move to V10 + V29
    expect(pctOf(screen.getByTestId('sim-timeline-seg-0'), 'width')).toBeCloseTo((10 / 56) * 100, 2);
    expect(screen.getByTestId('sim-timeline-pit-10')).toBeInTheDocument();
    expect(screen.queryByTestId('sim-timeline-pit-19')).not.toBeInTheDocument();
    expect(screen.getByTestId('sim-timeline-pit-29')).toBeInTheDocument();
  });

  it('under an error draft the tooltip falls back to geometry-only (no lying set numbers)', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    // break the total → the last-good plan prices DIFFERENT stints
    setLaps(0, 10);
    fireEvent.mouseEnter(screen.getByTestId('sim-timeline-seg-0'));
    const tip = screen.getByTestId('sim-timeline-tooltip');
    expect(tip.textContent).toContain('S · V1–10');
    expect(tip.textContent).not.toContain('bộ #');
  });
});

describe('TyreLabView — editor controls + inline errors + motion (v0.10.0 step 2)', () => {
  const model: SaveModel = buildShanghaiModel();

  it('the compound select became a coloured segmented control (5 pressed-state buttons)', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    const group = screen.getByTestId('sim-stint-0-compound');
    expect(within(group).getAllByRole('button')).toHaveLength(5);
    expect(compoundPressed(0, 'S')).toBe(true);
    for (const c of ['M', 'H', 'I', 'W']) expect(compoundPressed(0, c)).toBe(false);
    // the pressed cell is elevated with its own compound colour (inline
    // style — jsdom normalises the hex to rgba)
    expect(within(group).getByRole('button', { name: 'S' }).getAttribute('style')).toContain(
      'rgb(200, 16, 46)',
    );
    // switching to M moves the elevation
    setCompound(0, 'M');
    expect(compoundPressed(0, 'M')).toBe(true);
    expect(compoundPressed(0, 'S')).toBe(false);
    expect(within(group).getByRole('button', { name: 'M' }).getAttribute('style')).toContain(
      'rgb(227, 183, 30)',
    );
    // the pricing followed: S19/M19/M18 is a legal 56-lap plan
    expect(screen.getByTestId('sim-total-laps').textContent).toBe('Tổng: 56/56 vòng');
  });

  it('the laps stepper: + lifts 19 → 20 (total 57/56 red), − brings it back, floor is the engine min', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    fireEvent.click(screen.getByTestId('sim-stint-0-inc'));
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('20');
    const total = screen.getByTestId('sim-total-laps');
    expect(total.textContent).toBe('Tổng: 57/56 vòng');
    expect(total.className).toContain('text-danger');

    fireEvent.click(screen.getByTestId('sim-stint-0-dec'));
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('19');
    expect(screen.getByTestId('sim-total-laps').textContent).toBe('Tổng: 56/56 vòng');

    // the − button honours the engine's MIN_STINT_LAPS floor
    setLaps(0, 4);
    fireEvent.click(screen.getByTestId('sim-stint-0-dec'));
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('4');
    setLaps(0, 19);
    expect(screen.getByTestId('sim-total-laps').textContent).toBe('Tổng: 56/56 vòng');
  });

  it('an invalid total marks EVERY laps field aria-invalid with a red ring + a per-row error line, cleared on fix', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    setLaps(0, 10);
    const laps0 = screen.getByTestId('sim-stint-0-laps');
    expect(laps0.getAttribute('aria-invalid')).toBe('true');
    expect(laps0.className).toContain('ring-danger');
    expect(screen.getByTestId('sim-stint-0-error').textContent).toBe(
      'stint này làm tổng lệch 9 vòng',
    );
    // every stint row carries the same inline error (they share the blame)
    expect(screen.getByTestId('sim-stint-1-error').textContent).toBe(
      'stint này làm tổng lệch 9 vòng',
    );
    expect(screen.getByTestId('sim-stint-2-error').textContent).toBe(
      'stint này làm tổng lệch 9 vòng',
    );

    // fixing the total clears ring + message instantly (validate on change)
    setLaps(2, 27);
    expect(screen.getByTestId('sim-stint-0-laps').getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByTestId('sim-stint-0-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('sim-total-laps').textContent).toBe('Tổng: 56/56 vòng');
  });

  it('the error summary is a role=alert list; its goto link focuses stint 1 ONLY on click', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    setLaps(0, 10);
    const summary = screen.getByTestId('sim-error-summary');
    expect(summary.getAttribute('role')).toBe('alert');
    // the engine's own error, verbatim (the UI never re-translates)
    expect(screen.getByTestId('sim-summary-item-0').textContent).toContain(
      'tổng số vòng 47 ≠ 56 vòng của chặng',
    );
    // focus did NOT jump while typing
    expect(document.activeElement).not.toBe(screen.getByTestId('sim-stint-0-laps'));

    fireEvent.click(screen.getByTestId('sim-summary-goto'));
    expect(document.activeElement).toBe(screen.getByTestId('sim-stint-0-laps'));
    // the click-through also rings the row (the timeline's own affordance)
    expect(screen.getByTestId('sim-stint-row-0').className).toContain('ring-teal');
  });

  it('delete + stepper targets are ≥ 44×44px and every icon-only button has an aria-label', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    for (const i of [0, 1, 2]) {
      for (const kind of ['delete', 'inc', 'dec']) {
        const el = screen.getByTestId(`sim-stint-${i}-${kind}`);
        expect(el.className).toContain('min-h-[44px]');
        expect(el.className).toContain('min-w-[44px]');
        expect(el.getAttribute('aria-label')).not.toBeNull();
      }
    }
    expect(screen.getByTestId('sim-stint-0-delete').getAttribute('aria-label')).toBe('Xóa dòng');
    expect(screen.getByTestId('sim-stint-0-inc').getAttribute('aria-label')).toBe(
      'Tăng số vòng stint 1',
    );
    expect(screen.getByTestId('sim-stint-0-dec').getAttribute('aria-label')).toBe(
      'Giảm số vòng stint 1',
    );
  });

  it('adding and removing the 4th stint flows through AnimatePresence without breaking the draft', async () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    fireEvent.click(screen.getByTestId('sim-add-stint'));
    expect(screen.getByTestId('sim-stint-row-3')).toBeInTheDocument();
    expect((screen.getByTestId('sim-stint-3-laps') as HTMLInputElement).value).toBe('10');
    // S19/S19/M18/S10 sums to 66 → the summary + per-row errors appear
    expect(screen.getByTestId('sim-error-summary')).toBeInTheDocument();
    expect(screen.getByTestId('sim-stint-3-error')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sim-stint-3-delete'));
    await waitFor(() => {
      expect(screen.queryByTestId('sim-stint-row-3')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('sim-total-laps').textContent).toBe('Tổng: 56/56 vòng');
    expect(screen.getByTestId('sim-total').textContent).toBe('83.1s');
    expect(screen.getByTestId('sim-vs-best').textContent).toBe('bằng best');
  });

  it('the car picker is a joined segmented control with the active cell teal', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    expect(screen.getByTestId('sim-car-0').className).toContain('bg-teal/15');
    expect(screen.getByTestId('sim-car-0').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('sim-car-1').className).not.toContain('bg-teal/15');
    fireEvent.click(screen.getByTestId('sim-car-1'));
    expect(screen.getByTestId('sim-car-1').className).toContain('bg-teal/15');
    expect(screen.getByTestId('sim-car-0').className).not.toContain('bg-teal/15');
    // the draft survived the switch
    expect(screen.getByTestId('sim-total').textContent).toBe('83.1s');
  });

  it('a plan FASTER than best renders the vs-best chip in good green (negative delta)', async () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    // the lead draft with an SC window over its first pit prices below best
    fireEvent.click(screen.getByTestId('sim-add-event'));
    // the event lands on the draft's first pit (19) for 3 laps — the SC pit
    // cost (13.455s on this track) undercuts the green 20.7s pit. The hero
    // text flows through framer-motion's frame loop — waitFor it.
    await waitFor(() => {
      expect(screen.getByTestId('sim-total').textContent).toBe('75.8s');
    });
    const chip = screen.getByTestId('sim-vs-best');
    expect(chip.textContent).toBe('−7.3s so với best');
    expect(chip.className).toContain('text-good');
    expect(chip.className).not.toContain('text-danger');
  });

  it('step 3: bands carry a text tag (SC / MƯA) once they are ≥ 8% of the bar', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    // default event = 3 laps on 56 (5.4% < 8%) → no tag; widen it to 6
    fireEvent.click(screen.getByTestId('sim-add-event'));
    expect(screen.queryByTestId('sim-timeline-event-tag-0')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('sim-event-0-laps'), { target: { value: '6' } });
    expect(screen.getByTestId('sim-timeline-event-tag-0').textContent).toBe('SC');
    // switch the mode to VSC → the tag follows
    fireEvent.change(screen.getByTestId('sim-event-0-mode'), { target: { value: 'vsc' } });
    expect(screen.getByTestId('sim-timeline-event-tag-0').textContent).toBe('VSC');

    // the default rain window (10 laps = 17.9%) carries its tag immediately
    fireEvent.click(screen.getByTestId('sim-add-rain'));
    expect(screen.getByTestId('sim-timeline-rain-tag-0').textContent).toBe('MƯA');
  });

  it('step 3: stint rows wear a 3px left border in the selected compound colour', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={212} />));

    const row = screen.getByTestId('sim-stint-row-0');
    expect(row.getAttribute('style')).toContain('rgb(200, 16, 46)');
    setCompound(0, 'I');
    expect(row.getAttribute('style')).toContain('rgb(47, 168, 79)');
  });
});
