// @vitest-environment jsdom
/**
 * v0.9.1 — the stint tables name the PHYSICAL set each stint runs on
 * ("bộ #8 · mới · đời 31"), straight from the engine's real per-car
 * assignment — and no 2-M plan exists anywhere in the lab.
 *
 * Locked against the REAL MarinaBay save numbers (autosave-4.sav, Day
 * 46663, race 204, 62 laps — prompt §0/§4): the lead plan is
 * S(17) → S(18) → M(27) with the M stint on fresh set #8 (life 31); the
 * old v0.8.1 lead "S(16) → M(23) → M(23)" — runnable only by pretending
 * one M set runs two stints — is gone from every list (ranked, hero,
 * trail, alternatives, what-if, recommendation).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { TyreLabView } from '@/components/pitwall/TyreLabView';
import { buildMarinaBayModel } from '../helpers/marinabay-fixture';
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

describe('TyreLabView — the assigned set per stint (v0.9.1, MarinaBay save)', () => {
  const model: SaveModel = buildMarinaBayModel();

  it('the hero plan is S(17) → S(18) → M(27) and each stint names its set (#8 for the M stint)', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={204} />));

    // the lead plan headline — the old S(16) → M(23) → M(23) must not exist
    const hero = screen.getByTestId('tyre-stint-table');
    const heroHeading = hero.closest('section')!.querySelector('h3')!;
    expect(heroHeading.textContent).toContain('S(17) → S(18) → M(27)');
    expect(heroHeading.textContent).not.toContain('M(23)');

    // the M stint (27 laps) runs the fresh set #8, life 31 — the save's own set
    expect(within(hero).getByText('bộ #8 · mới · đời 31')).toBeInTheDocument();
    // the two S stints run fresh 21-life sets (the real assignment: longest
    // stint ↔ longest-life set → S18 → #1, S17 → #2)
    expect(within(hero).getByText('bộ #2 · mới · đời 21')).toBeInTheDocument();
    expect(within(hero).getByText('bộ #1 · mới · đời 21')).toBeInTheDocument();
  });

  it('the trail plan card shows its stint sets too — and the whole lab has no 2-M stint row', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={204} />));

    const trail = screen.getByTestId('trail-stint-table');
    // trail M→S→S: the M stint also runs set #8; the S stints run #2/#1
    expect(within(trail).getByText('bộ #8 · mới · đời 31')).toBeInTheDocument();

    // no "M(23)" laps row can appear anywhere — every plan the lab can show
    // (hero, trail, alternatives, what-if) carries at most ONE M stint
    const lab = screen.getByTestId('tyre-lab');
    expect(lab.textContent).not.toContain('S(16) → M(23) → M(23)');
    for (const plan of lab.querySelectorAll('tbody tr')) {
      const mCells = Array.from(plan.querySelectorAll('td')).filter(
        (td) => td.textContent === '23',
      );
      // a 2-M plan would show two 23-lap M stints in one plan row
      expect(mCells.length).toBeLessThan(2);
    }
  });

  it('renders the same set ids in English', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={204} />, 'en'));
    const hero = screen.getByTestId('tyre-stint-table');
    expect(within(hero).getByText('set #8 · fresh · life 31')).toBeInTheDocument();
  });
});
