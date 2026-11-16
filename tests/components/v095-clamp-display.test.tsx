// @vitest-environment jsdom
/**
 * v0.9.5 — a clamped value is never displayed as if it were the reading
 * (view-only fix; the engine has been right since v0.9.3). The ONE display
 * rule: an entry with `rawDelta` on record shows THE RAW value marked
 * "discarded"; an unclamped entry shows `delta` (= the raw measurement).
 *
 * Faces covered (the three that render `paceMeasured`):
 *   · the evidence-clock chip ("đo được +0.38s — bị loại vì nhiễu…"),
 *   · the warn line under the clock (clampedWarn vs unmeasuredWarn),
 *   · the mid-practice draft chips ("H +0.38s (bị loại)").
 *
 * The matrix locks the warn selection: clamped sides → clampedWarn; any
 * other model-ranked shape → the OLD unmeasuredWarn VERBATIM (MarinaBay);
 * both sides usable → no warn at all.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { TyreLabView } from '@/components/pitwall/TyreLabView';
import {
  buildInterlagosModel,
  INTERLAGOS_RACE_ID,
} from '../helpers/interlagos-fixture';
import {
  buildMarinaBayModel,
  MARINA_RACE_ID,
} from '../helpers/marinabay-fixture';
import type { SaveModel, PracticeResult } from '@/domain/types';

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

/** 9 practice rows (3 drivers per compound) with the given best laps (s). */
function practiceRows(s: number, m: number, h: number, hDrivers = 3): PracticeResult[] {
  const rows: PracticeResult[] = [
    { driverId: 1, teamId: 2, session: 1, bestLapMs: s * 1000, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 2, teamId: 2, session: 1, bestLapMs: (s + 0.12) * 1000, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 3, teamId: 3, session: 1, bestLapMs: (s + 0.24) * 1000, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 4, teamId: 3, session: 1, bestLapMs: m * 1000, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 5, teamId: 4, session: 1, bestLapMs: (m + 0.12) * 1000, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 6, teamId: 4, session: 1, bestLapMs: (m + 0.24) * 1000, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 7, teamId: 5, session: 1, bestLapMs: h * 1000, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 8, teamId: 5, session: 1, bestLapMs: (h + 0.12) * 1000, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 9, teamId: 6, session: 1, bestLapMs: (h + 0.24) * 1000, bestLapTyre: 0, raceFormula: 1 },
  ];
  return rows.slice(0, 6 + hDrivers); // drop H rows first when hDrivers < 3
}

function withPractice(s: number, m: number, h: number, hDrivers = 3): SaveModel {
  const model = buildInterlagosModel();
  const race = model.races.find((r) => r.raceId === INTERLAGOS_RACE_ID)!;
  race.practice = practiceRows(s, m, h, hDrivers);
  return model;
}

function renderLab(model: SaveModel, raceId: number, locale: 'vi' | 'en' = 'vi') {
  useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
  render(withI18n(<TyreLabView model={model} raceId={raceId} />, locale));
}

describe('TyreLabView — clamped values never render as the reading (v0.9.5, Interlagos shape)', () => {
  it('chip H shows the RAW +0.38s discarded; chip M keeps +0.97s; the clamped 1.12 appears nowhere', () => {
    renderLab(buildInterlagosModel(), INTERLAGOS_RACE_ID);

    const clock = screen.getByTestId('evidence-clock');
    // chip H: the raw measurement, marked discarded — the ranking delta
    // (+1.05s model) stays the headline of the chip
    expect(within(clock).getByText('đo được +0.38s — bị loại vì nhiễu, xếp hạng bằng model')).toBeInTheDocument();
    expect(within(clock).getByText('+1.05s')).toBeInTheDocument();
    // chip M: unchanged — its delta IS the measurement (no clamp fired)
    expect(within(clock).getByText('đo được +0.97s — xếp hạng bằng model')).toBeInTheDocument();
    expect(within(clock).getByText('+0.55s')).toBeInTheDocument();
    // the clamped value is gone from the whole clock
    expect(clock.textContent).not.toContain('1.12');
  });

  it('the warn line is clampedWarn with the exact DoD sentence', () => {
    renderLab(buildInterlagosModel(), INTERLAGOS_RACE_ID);
    const warn = screen.getByTestId('evidence-warning');
    expect(warn.getAttribute('data-warn')).toBe('clamped');
    expect(warn.textContent).toBe(
      'Xếp hạng đang dùng hằng số model cho cả M và H vì H (+0.38s) đo được nhưng bị loại vì nhiễu — đã đo được: M +0.97s.',
    );
    expect(warn.textContent).not.toContain('chưa đo được ở track này');
    expect(warn.textContent).not.toContain('vì —');
    expect(warn.textContent).not.toContain('1.12');
  });

  it('both sides clamped → clampedWarn lists both, measured "—"', () => {
    // M raw +3.00 → bound-clamped to 2.50; H raw +4.00 → bound-clamped to
    // 3.50 (monotonic holds) — both raws stay positive, both on record
    renderLab(withPractice(90.0, 93.0, 94.0), INTERLAGOS_RACE_ID);
    const warn = screen.getByTestId('evidence-warning');
    expect(warn.getAttribute('data-warn')).toBe('clamped');
    expect(warn.textContent).toBe(
      'Xếp hạng đang dùng hằng số model cho cả M và H vì M (+3.00s) và H (+4.00s) đo được nhưng bị loại vì nhiễu — đã đo được: —.',
    );
  });

  it('one usable + one never measured → the OLD unmeasuredWarn (not clampedWarn)', () => {
    // only 2 H drivers → H genuinely unmeasured; M stays a real measurement
    renderLab(withPractice(90.0, 90.97, 92.0, 2), INTERLAGOS_RACE_ID);
    const warn = screen.getByTestId('evidence-warning');
    expect(warn.getAttribute('data-warn')).toBe('unmeasured');
    expect(warn.textContent).toBe(
      'Xếp hạng đang dùng hằng số model cho cả M và H vì H chưa đo được ở track này (đã đo được: M +0.97s) — coi như ước lượng.',
    );
  });

  it('never measured both (MarinaBay) → the OLD unmeasuredWarn VERBATIM', () => {
    renderLab(buildMarinaBayModel(), MARINA_RACE_ID);
    const warn = screen.getByTestId('evidence-warning');
    expect(warn.getAttribute('data-warn')).toBe('unmeasured');
    expect(warn.textContent).toBe(
      'Xếp hạng đang dùng hằng số model cho cả M và H vì M, H chưa đo được ở track này (đã đo được: —) — coi như ước lượng.',
    );
  });

  it('both sides usable → NO warn line at all', () => {
    // H honest (+2.50, slower than M, in bounds) → practice/practice
    renderLab(withPractice(90.0, 90.97, 92.5), INTERLAGOS_RACE_ID);
    expect(screen.queryByTestId('evidence-warning')).not.toBeInTheDocument();
  });

  it('the mid-practice draft shows the raw value + "(bị loại)" for the clamped side', () => {
    const model = buildInterlagosModel();
    // strip qualifying → readiness gates on quali → the draft block renders
    model.races[0]!.qualifying = [];
    renderLab(model, INTERLAGOS_RACE_ID);

    const draft = screen.getByTestId('tyre-practice-draft');
    expect(draft.textContent).toContain('H +0.38s (bị loại)');
    expect(draft.textContent).toContain('M +0.97s');
    expect(draft.textContent).not.toContain('1.12');
  });

  it('en locale mirrors both new keys', () => {
    renderLab(buildInterlagosModel(), INTERLAGOS_RACE_ID, 'en');
    const clock = screen.getByTestId('evidence-clock');
    expect(within(clock).getByText('measured +0.38s — discarded as noise, ranked as model')).toBeInTheDocument();
    const warn = screen.getByTestId('evidence-warning');
    expect(warn.textContent).toBe(
      'Ranking uses the model constant for both M and H — H (+0.38s) was measured but discarded as noise. Measured: M +0.97s.',
    );
  });
});
