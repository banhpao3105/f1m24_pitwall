// @vitest-environment jsdom
/**
 * v0.8.0 — the Car Lab aero-strength section shows the engine's numbers,
 * labels fallback sources, and switches the head-to-head rival live.
 *
 * Fixture: tests/helpers/car-strength-fixture.ts — the owner-verified DoD
 * table (post-Monza save). Locked here:
 *   - RearWing LowSpeedDownforce row: 222.0 · 32.4% · 36.9% · Williams 672.7
 *   - Floor DragReduction row: 69.2%
 *   - Red Bull's RearWing best cell (DRSDelta) carries the "thiết kế mới
 *     nhất" (latest) source tag — a fallback design IS the best there
 *   - switching the rival to Red Bull updates the RearWing DRSDelta rival
 *     cell to 815.0 WITHOUT touching the player/best columns
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { CarLabView } from '@/components/pitwall/CarLabView';
import { buildCarStrengthFixture } from '../helpers/car-strength-fixture';

afterEach(cleanup);

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
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

describe('CarLabView — aero strength section (v0.8.0)', () => {
  it('renders the honest note, the DoD numbers, and the default Williams rival', () => {
    const model = buildCarStrengthFixture();
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<CarLabView model={model} />));

    const section = screen.getByTestId('car-strength');
    expect(section).toBeInTheDocument();

    // the mandatory honest note (per-stat best + no lap-time conversion)
    const note = within(section).getByTestId('car-strength-note');
    expect(note.textContent).toContain('TỪNG chỉ số');
    expect(note.textContent).toContain('thời gian vòng');

    // default rival = Williams + the standings gap line
    const select = within(section).getByTestId('strength-rival-select') as HTMLSelectElement;
    expect(select.value).toBe('6');
    expect(within(section).getByTestId('strength-gap').textContent).toContain('95');

    // the headline DoD row: RearWing LowSpeedDownforce
    const rwLow = within(section).getByTestId('strength-row-RearWing-LowSpeedDownforce');
    expect(within(rwLow).getByTestId('strength-player').textContent).toBe('222.0');
    expect(within(rwLow).getByTestId('strength-pct-best').textContent).toBe('32.4%');
    expect(within(rwLow).getByTestId('strength-pct-mean').textContent).toBe('36.9%');
    expect(within(rwLow).getByTestId('strength-best-team').textContent).toBe('Mercedes AMG Petronas F1');
    expect(within(rwLow).getByTestId('strength-best-value').textContent).toBe('686.2');
    expect(within(rwLow).getByTestId('strength-rival-value').textContent).toBe('672.7');
    // Williams is 450.7 ahead here — delta renders with a sign
    expect(within(rwLow).getByTestId('strength-delta').textContent).toBe('+450.7');

    // Floor DragReduction: 537.3 / 69.2% / 75.4%
    const floorDrag = within(section).getByTestId('strength-row-Floor-DragReduction');
    expect(within(floorDrag).getByTestId('strength-player').textContent).toBe('537.3');
    expect(within(floorDrag).getByTestId('strength-pct-best').textContent).toBe('69.2%');
    expect(within(floorDrag).getByTestId('strength-pct-mean').textContent).toBe('75.4%');

    // FrontWing AirFlowFront: 808.9 / 96.4% / 102.6%
    const fwFront = within(section).getByTestId('strength-row-FrontWing-AirFlowFront');
    expect(within(fwFront).getByTestId('strength-player').textContent).toBe('808.9');
    expect(within(fwFront).getByTestId('strength-pct-best').textContent).toBe('96.4%');
    expect(within(fwFront).getByTestId('strength-pct-mean').textContent).toBe('102.6%');

    // the table carries all 22 stat rows
    expect(within(section).getAllByTestId(/^strength-row-/)).toHaveLength(22);

    // weak rows (pctBest < 60) are flagged — RW LowDF 32.4% and FW MedDF 42.9% among them
    expect(rwLow).toHaveAttribute('data-weak', 'true');
    const fwMed = within(section).getByTestId('strength-row-FrontWing-MedSpeedDownforce');
    expect(fwMed).toHaveAttribute('data-weak', 'true');
    // strong rows are not flagged
    expect(fwFront).not.toHaveAttribute('data-weak');
  });

  it('labels fallback sources: Red Bull RearWing best cell says "thiết kế mới nhất"', () => {
    const model = buildCarStrengthFixture();
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<CarLabView model={model} />));

    const section = screen.getByTestId('car-strength');
    // Red Bull is the best on RearWing DRSDelta via its latest-completed design
    const rwDrs = within(section).getByTestId('strength-row-RearWing-DRSDelta');
    expect(within(rwDrs).getByTestId('strength-best-team').textContent).toBe('Red Bull Racing');
    const bestCell = within(rwDrs).getByTestId('strength-best-cell');
    expect(within(bestCell).getByTestId('strength-src-latest').textContent).toBe('thiết kế mới nhất');
    // the player's own parts on that row are installed — no latest tag in the player cell
    const playerCell = within(rwDrs).getByTestId('strength-player-cell');
    expect(within(playerCell).getByTestId('strength-src-installed')).toBeInTheDocument();
    // Williams' SidePods rival values come from the fallback design too
    const spFront = within(section).getByTestId('strength-row-SidePods-AirFlowFront');
    const rivalCell = within(spFront).getByTestId('strength-rival-cell');
    expect(within(rivalCell).getByTestId('strength-src-latest')).toBeInTheDocument();
  });

  it('switching the rival to Red Bull updates the rival column — nothing else moves', () => {
    const model = buildCarStrengthFixture();
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<CarLabView model={model} />));

    const section = screen.getByTestId('car-strength');
    const select = within(section).getByTestId('strength-rival-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '3' } });

    // the prompt's head-to-head check: RearWing DRSDelta rival becomes 815.0
    const rwDrs = within(section).getByTestId('strength-row-RearWing-DRSDelta');
    expect(within(rwDrs).getByTestId('strength-rival-value').textContent).toBe('815.0');
    // player/best/mean untouched by the rival switch
    expect(within(rwDrs).getByTestId('strength-player').textContent).toBe('782.4');
    expect(within(rwDrs).getByTestId('strength-best-value').textContent).toBe('815.0');
    // delta = rival − player: Red Bull is 32.6 ahead of the player's 782.4
    expect(within(rwDrs).getByTestId('strength-delta').textContent).toBe('+32.6');

    // a row where the rival changed keeps its player value; the rival value
    // is now RED BULL'S OWN RearWing LowDF (the synthetic fill, not the best)
    const rwLow = within(section).getByTestId('strength-row-RearWing-LowSpeedDownforce');
    expect(within(rwLow).getByTestId('strength-player').textContent).toBe('222.0');
    expect(within(rwLow).getByTestId('strength-rival-value').textContent).toBe('630.7');

    // the gap line switched to Red Bull's standings
    expect(within(section).getByTestId('strength-gap').textContent).toContain('Red Bull');
  });
});
