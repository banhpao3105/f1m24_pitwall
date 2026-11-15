// @vitest-environment jsdom
/**
 * v0.7.1 step 3c — the grid card shows what the save ACTUALLY carries:
 * the qualifying order plus penalties already present. The post-race grid
 * must never leak backwards out of a pre-race save, an unverified seat
 * never eats a penalty (it is listed as unresolved instead), and the
 * "no penalty in this save" note is visible whenever nothing is pending.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { RaceWeekendView } from '@/components/pitwall/RaceWeekendView';
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

function quali(): QualifyingResult[] {
  // stage-1 rows: O'Ward P1, Ricciardo P2, rival P3, rival P4
  return [
    { driverId: 285, driverName: "Pato O'Ward", teamId: PLAYER_TEAM, finishingPos: 1, stage: 1, raceFormula: 1 },
    { driverId: 13, driverName: 'Daniel Ricciardo', teamId: PLAYER_TEAM, finishingPos: 2, stage: 1, raceFormula: 1 },
    { driverId: 7, driverName: 'Rival A', teamId: 1, finishingPos: 3, stage: 1, raceFormula: 1 },
    { driverId: 8, driverName: 'Rival B', teamId: 1, finishingPos: 4, stage: 1, raceFormula: 1 },
  ];
}

function practice(): PracticeResult[] {
  // one session is enough for the gate; lap counts stay at 0 — the real
  // Monza state, so the seat mapping is UNVERIFIED
  return [
    { driverId: 285, teamId: PLAYER_TEAM, session: 1, bestLapMs: 90_000, bestLapTyre: 2, lapCount: 0 },
    { driverId: 13, teamId: PLAYER_TEAM, session: 1, bestLapMs: 90_100, bestLapTyre: 2, lapCount: 0 },
    { driverId: 7, teamId: 1, session: 1, bestLapMs: 90_200, bestLapTyre: 2, lapCount: 0 },
    { driverId: 8, teamId: 1, session: 1, bestLapMs: 90_300, bestLapTyre: 2, lapCount: 0 },
  ];
}

function allocation(): TyreAllocation[] {
  return [20, 21].flatMap((carId) =>
    ([2, 1, 0] as const).map((type, i) => ({
      carId,
      tyreSetId: carId * 3 + i + 1,
      weekendTyreType: type,
      frontLeftWear: 1,
      availabilityState: 0,
      estimatedLapLifeRemaining: 30 - i,
    })),
  );
}

function gridModel(pendingPenalty: boolean): SaveModel {
  return {
    meta: {
      id: 'grid-test', fileName: 'grid-test.sav', fileSizeBytes: 1,
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
      rows: pendingPenalty
        ? [{
            penaltyId: 1, teamId: PLAYER_TEAM, carInTeam: 1, reasonForPenalty: 3,
            sessionReceived: 6, served: 0, pitLaneStart: 0, serveInRace: 1, serveInSprint: 0,
          }]
        : [],
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

describe('RaceWeekendView — the grid card (v0.7.1 step 3c)', () => {
  it('renders the quali order and the no-penalty note when nothing is pending', () => {
    const model = gridModel(false);
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<RaceWeekendView model={model} raceId={1} />));
    const card = screen.getByTestId('race-grid');
    expect(card).toBeInTheDocument();
    const rows = [...card.querySelectorAll('[data-testid="race-grid-list"] li')];
    expect(rows.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Pato O'Ward"),
      expect.stringContaining('Daniel Ricciardo'),
      expect.stringContaining('Rival A'),
      expect.stringContaining('Rival B'),
    ]);
    // every grid slot equals its quali slot — nothing moved
    expect(rows.map((li) => li.querySelector('span')!.textContent)).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(screen.getByTestId('grid-no-penalty-note')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-unresolved-0')).toBeNull();
  });

  it('a pending penalty on an UNVERIFIED seat is listed unresolved — the grid does not move', () => {
    const model = gridModel(true);
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<RaceWeekendView model={model} raceId={1} />));
    // grid unchanged: O'Ward still P1
    const rows = [...screen.getByTestId('race-grid-list').querySelectorAll('li')];
    expect(rows[0]!.textContent).toContain("Pato O'Ward");
    expect(rows[0]!.querySelector('span')!.textContent).toBe('P1');
    // the unresolved line names team + car + reason + the seat caveat
    const unresolved = screen.getByTestId('grid-unresolved-0');
    expect(unresolved.textContent).toContain('chưa gán được xe');
    expect(unresolved.textContent).toContain('gây va chạm');
  });
});
