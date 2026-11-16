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
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setCompound(index: number, value: string): void {
  fireEvent.change(screen.getByTestId(`sim-stint-${index}-compound`), {
    target: { value },
  });
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
    // default stints = the LEAD plan S19/S19/M18
    expect((screen.getByTestId('sim-stint-0-compound') as HTMLSelectElement).value).toBe('S');
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('19');
    expect((screen.getByTestId('sim-stint-1-compound') as HTMLSelectElement).value).toBe('S');
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('19');
    expect((screen.getByTestId('sim-stint-2-compound') as HTMLSelectElement).value).toBe('M');
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

  it('B8 via the builder: B1 + an SC[19,21] event → 93.2s', () => {
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

    expect(screen.getByTestId('sim-total').textContent).toBe('93.2s');
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
    expect((screen.getByTestId('sim-stint-0-compound') as HTMLSelectElement).value).toBe('S');
    expect((screen.getByTestId('sim-stint-1-compound') as HTMLSelectElement).value).toBe('M');
  });
});
