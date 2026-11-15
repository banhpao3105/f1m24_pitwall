// @vitest-environment jsdom
/**
 * v0.7.2 — the per-car inventory cards show THAT car's numbers.
 *
 * v0.7.1 bug (verified live): inside `inventory.cars.map(...)` the card
 * (correct header: car label + CarID) rendered `inventory.teamAggregate` —
 * both cards showed the TEAM totals (S fresh ×6 / used ×10) instead of the
 * car's own sets (S fresh ×3 / used ×5). Engine numbers were always right
 * (`InventoryCar.sets`); this is the view-level sibling of the v0.7.0
 * fallback bug (wrong SCOPE, one level down: whole team instead of the car).
 *
 * Locked against the REAL Monza pre-race per-car numbers (save4.sav,
 * Save_CarTyreAllocation, wear = min 4 wheels, fresh = FrontLeftWear ≥ 0.99):
 *   Car 20 used S: wear 65–90%, life 16–22 — Car 21 used S: 54–90%, 13–22
 *   Car 20 used M: life 22–29 — Car 21 used M: life 20 (both sets)
 *   Team union: S fresh ×6 / used ×10 — visible ONCE, outside the cards.
 * The red phase of this test ran against the old code (cards carried ×6)
 * and failed on every per-car assertion — see the commit message.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { TyreLabView } from '@/components/pitwall/TyreLabView';
import { emptyPhase2Sections } from '../helpers/model';
import type { SaveModel, QualifyingResult, PracticeResult, TyreAllocation } from '@/domain/types';

afterEach(cleanup);

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      {ui}
    </NextIntlClientProvider>
  );
}

const PLAYER_TEAM = 32;

/** The REAL per-car Monza allocation (same numbers as the engine fixture in
 * tests/engines/grid.engine.test.ts — the two cars MUST differ). */
function allocation(): TyreAllocation[] {
  const sets: TyreAllocation[] = [];
  const push = (
    carId: number, type: number, life: number,
    opts: { laps?: number; session?: number; state?: number; wear?: number } = {},
  ) => {
    sets.push({
      carId,
      tyreSetId: sets.length + 1,
      weekendTyreType: type,
      frontLeftWear: opts.wear ?? 1,
      availabilityState: opts.state ?? 0,
      estimatedLapLifeRemaining: life,
      ...(opts.laps != null ? { lapsCompleted: opts.laps, sessionLastUsedIn: opts.session ?? 1 } : {}),
    });
  };
  // two rival cars so the CarID→team map has neighbours, like the real save
  push(0, 2, 26);
  push(0, 1, 39);
  push(0, 0, 60);
  push(1, 2, 26);
  push(1, 1, 39);
  push(1, 0, 60);
  // car 20: S fresh ×3 (24) + used ×5 (wear 65–90%, life 16–22);
  //         M fresh ×1 (36) + used ×2 (wear 60–82%, life 22–29);
  //         H fresh ×1 (55) + used ×1 (wear 74%, life 41)
  push(20, 2, 24); push(20, 2, 24); push(20, 2, 24);
  push(20, 2, 22, { state: 2, wear: 0.65 });
  push(20, 2, 20, { state: 2, wear: 0.7 });
  push(20, 2, 19, { state: 2, wear: 0.75 });
  push(20, 2, 17, { state: 2, wear: 0.8 });
  push(20, 2, 16, { state: 2, wear: 0.9 });
  push(20, 1, 36);
  push(20, 1, 29, { state: 2, wear: 0.6 });
  push(20, 1, 22, { state: 2, wear: 0.82 });
  push(20, 0, 55);
  push(20, 0, 41, { state: 2, wear: 0.74 });
  // car 21: S fresh ×3 (24) + used ×5 (wear 54–90%, life 13–22);
  //         M fresh ×1 (36) + used ×2 (wear 55–57%, both life 20);
  //         H fresh ×1 (55) + used ×1 (wear 74%, life 41)
  push(21, 2, 24); push(21, 2, 24); push(21, 2, 24);
  push(21, 2, 22, { state: 2, wear: 0.54 });
  push(21, 2, 20, { state: 2, wear: 0.6 });
  push(21, 2, 18, { state: 2, wear: 0.7 });
  push(21, 2, 15, { state: 2, wear: 0.8 });
  push(21, 2, 13, { state: 2, wear: 0.9 });
  push(21, 1, 36);
  push(21, 1, 20, { state: 2, wear: 0.55 });
  push(21, 1, 20, { state: 2, wear: 0.57 });
  push(21, 0, 55);
  push(21, 0, 41, { state: 2, wear: 0.74 });
  return sets;
}

function quali(): QualifyingResult[] {
  return [
    { driverId: 285, driverName: "Pato O'Ward", teamId: PLAYER_TEAM, finishingPos: 1, stage: 1, raceFormula: 1 },
    { driverId: 13, driverName: 'Daniel Ricciardo', teamId: PLAYER_TEAM, finishingPos: 2, stage: 1, raceFormula: 1 },
    { driverId: 7, driverName: 'Rival A', teamId: 1, finishingPos: 3, stage: 1, raceFormula: 1 },
    { driverId: 8, driverName: 'Rival B', teamId: 1, finishingPos: 4, stage: 1, raceFormula: 1 },
  ];
}

function practice(): PracticeResult[] {
  // lapCount 0 — the real Monza state, so the seat mapping is UNVERIFIED
  // and the cards carry the "Xe 1 / Xe 2" labels
  return [
    { driverId: 285, teamId: PLAYER_TEAM, session: 1, bestLapMs: 90_000, bestLapTyre: 2, lapCount: 0 },
    { driverId: 13, teamId: PLAYER_TEAM, session: 1, bestLapMs: 90_100, bestLapTyre: 2, lapCount: 0 },
    { driverId: 7, teamId: 1, session: 1, bestLapMs: 90_200, bestLapTyre: 2, lapCount: 0 },
    { driverId: 8, teamId: 1, session: 1, bestLapMs: 90_300, bestLapTyre: 2, lapCount: 0 },
  ];
}

function inventoryModel(): SaveModel {
  return {
    meta: {
      id: 'inventory-test', fileName: 'inventory-test.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24' as const, saveGameVersion: 11, parsedAt: '2027-01-01T00:00:00Z',
      seasonId: 3, day: 100, playerTeamId: PLAYER_TEAM,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: PLAYER_TEAM, teamName: 'CustomTeam', customTeamEnabled: true },
    teams: [
      { teamId: PLAYER_TEAM, teamName: 'CustomTeam', isCustomTeam: true, formula: 1 },
      { teamId: 1, teamName: 'Rival', isCustomTeam: false, formula: 1 },
    ],
    drivers: [
      { staffId: 285, fullName: "Pato O'Ward", teamId: PLAYER_TEAM },
      { staffId: 13, fullName: 'Daniel Ricciardo', teamId: PLAYER_TEAM },
      { staffId: 7, fullName: 'Rival A', teamId: 1 },
      { staffId: 8, fullName: 'Rival B', teamId: 1 },
    ],
    staff: [],
    seasons: [{ seasonId: 3 }],
    standings: { drivers: [], teams: [] },
    tyres: allocation(),
    races: [
      {
        raceId: 1, seasonId: 3, trackId: 9, trackName: 'Monza', day: 100,
        state: 0, isSprint: false, laps: 53, results: [],
        practice: practice(),
        qualifying: quali(),
      },
    ],
    gridPenalties: {
      rows: [],
      reasonPlaces: { 0: 5, 1: 5, 2: 5, 3: 3, 4: 5, 5: 0 },
      carTeams: [
        { carId: 20, teamId: PLAYER_TEAM },
        { carId: 21, teamId: PLAYER_TEAM },
        { carId: 0, teamId: 1 },
        { carId: 1, teamId: 1 },
      ],
      carTeamsVerified: true,
    },
    ...emptyPhase2Sections(),
    availability: [],
  } as SaveModel;
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

/** The card container of a car: walk up from the per-car label testid to
 * the ancestor that holds the tyre list. Works on old and new code so the
 * red phase fails on the NUMBERS, not on a missing testid. */
function cardOf(carId: number): HTMLElement {
  let el: HTMLElement = screen.getByTestId(`inventory-car-${carId}`);
  while (!el.querySelector('ul')) {
    if (!el.parentElement) throw new Error(`card container for car ${carId} not found`);
    el = el.parentElement;
  }
  return el;
}

describe('TyreLabView — per-car inventory cards (v0.7.2)', () => {
  it('each card shows ITS OWN sets; the team aggregate appears exactly once outside the cards', () => {
    const model = inventoryModel();
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={1} />));

    const section = screen.getByTestId('tyre-inventory');
    const card20 = cardOf(20);
    const card21 = cardOf(21);

    // both cards still carry their identity headers
    expect(within(card20).getByTestId('inventory-car-20').textContent).toBe('Xe 1');
    expect(within(card21).getByTestId('inventory-car-21').textContent).toBe('Xe 2');
    expect(within(card20).getByText('CarID 20')).toBeInTheDocument();
    expect(within(card21).getByText('CarID 21')).toBeInTheDocument();

    // per-car S: fresh ×3 on BOTH cars, but the used ranges DIFFER per car —
    // this is the discriminator the old code failed (both cards showed the
    // team's "đã dùng ×10 (mòn 54–90%, đời 13–22)")
    expect(within(card20).getByText('mới ×3 (đời 24)')).toBeInTheDocument();
    expect(within(card21).getByText('mới ×3 (đời 24)')).toBeInTheDocument();
    expect(within(card20).getByText('đã dùng ×5 (mòn 65–90%, đời 16–22)')).toBeInTheDocument();
    expect(within(card21).getByText('đã dùng ×5 (mòn 54–90%, đời 13–22)')).toBeInTheDocument();

    // per-car M: the discriminator from the prompt (life 22–29 vs both 20)
    expect(within(card20).getByText('đã dùng ×2 (mòn 60–82%, đời 22–29)')).toBeInTheDocument();
    expect(within(card21).getByText('đã dùng ×2 (mòn 55–57%, đời 20)')).toBeInTheDocument();

    // per-car H
    expect(within(card20).getByText('mới ×1 (đời 55)')).toBeInTheDocument();
    expect(within(card20).getByText('đã dùng ×1 (mòn 74%, đời 41)')).toBeInTheDocument();
    expect(within(card21).getByText('mới ×1 (đời 55)')).toBeInTheDocument();
    expect(within(card21).getByText('đã dùng ×1 (mòn 74%, đời 41)')).toBeInTheDocument();

    // NO card may contain the team totals under any form
    expect(within(card20).queryByText('mới ×6 (đời 24)')).toBeNull();
    expect(within(card21).queryByText('mới ×6 (đời 24)')).toBeNull();
    expect(within(card20).queryByText('đã dùng ×10 (mòn 54–90%, đời 13–22)')).toBeNull();
    expect(within(card21).queryByText('đã dùng ×10 (mòn 54–90%, đời 13–22)')).toBeNull();

    // the team aggregate lives ONCE, outside the cards, clearly labelled
    const teamLine = screen.getByTestId('tyre-inventory-team');
    expect(within(teamLine).getByText(/Cả đội/)).toBeInTheDocument();
    expect(within(teamLine).getByText('mới ×6 (đời 24)')).toBeInTheDocument();
    expect(within(teamLine).getByText('đã dùng ×10 (mòn 54–90%, đời 13–22)')).toBeInTheDocument();
    expect(within(teamLine).getByText('mới ×2 (đời 36)')).toBeInTheDocument();
    expect(within(teamLine).getByText('đã dùng ×4 (mòn 55–82%, đời 20–29)')).toBeInTheDocument();
    expect(within(teamLine).getByText('mới ×2 (đời 55)')).toBeInTheDocument();
    expect(within(teamLine).getByText('đã dùng ×2 (mòn 74%, đời 41)')).toBeInTheDocument();
    // exactly one occurrence of the team fresh-S total in the whole section
    expect(within(section).getAllByText('mới ×6 (đời 24)')).toHaveLength(1);
    // and it must not be inside any car card
    expect(within(card20).queryByText(/Cả đội/)).toBeNull();
    expect(within(card21).queryByText(/Cả đội/)).toBeNull();

    // the execution cap header is unchanged (engine numbers untouched)
    expect(within(section).getByText(/S 24 \/ M 36 \/ H 55/)).toBeInTheDocument();

    // unverified seats: the per-car caveat still shows (labels Xe 1/Xe 2)
    expect(within(section).getByText('Chưa xác minh được CarID nào là xe nào (kiểm tra trong game) — nhãn Xe 1/Xe 2 theo thứ tự đội.')).toBeInTheDocument();
  });
});
