// @vitest-environment jsdom
/**
 * v0.7.0 step 1 — the team-result line must never print the literal word
 * "false" (RaceWeekendView passed String(dnf) into the {dnf} i18n slot).
 * Verified live on the post-race Monza save: "Kết quả đội bạn: P14 (0 pts)
 * false" — the suffix contract is '' for a classified finish, ' — DNF' for
 * a retirement (vi + en share the same marker, untranslated).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { RaceWeekendView } from '@/components/pitwall/RaceWeekendView';
import { emptyPhase2Sections } from '../helpers/model';
import type { SaveModel } from '@/domain/types';

afterEach(cleanup);

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      {ui}
    </NextIntlClientProvider>
  );
}

const PLAYER_TEAM = 32;

function modelWithPlayerResult(dnf: boolean): SaveModel {
  const base = {
    meta: {
      id: 'dnf-test',
      fileName: 'dnf-test.sav',
      fileSizeBytes: 1,
      gameVersion: 'F1M24' as const,
      saveGameVersion: 11,
      parsedAt: '2027-01-01T00:00:00Z',
      seasonId: 3,
      day: 100,
      playerTeamId: PLAYER_TEAM,
      tablesPresent: [],
      tablesMissing: [],
      warnings: [],
    },
    player: { teamId: PLAYER_TEAM, teamName: 'CustomTeam', customTeamEnabled: true },
    teams: [
      { teamId: PLAYER_TEAM, teamName: 'CustomTeam', isCustomTeam: true, formula: 1 },
      { teamId: 1, teamName: 'Rival', isCustomTeam: false, formula: 1 },
    ],
    drivers: [
      { staffId: 13, fullName: 'Ric Test', teamId: PLAYER_TEAM },
      { staffId: 285, fullName: 'Ow Test', teamId: PLAYER_TEAM },
    ],
    staff: [],
    seasons: [{ seasonId: 3 }],
    standings: { drivers: [], teams: [] },
    tyres: [],
    availability: [],
  };
  return {
    ...base,
    races: [
      {
        raceId: 1,
        seasonId: 3,
        trackId: 9,
        trackName: 'Monza',
        day: 90,
        state: 2,
        isSprint: false,
        laps: 53,
        results: [
          {
            driverId: 13,
            driverName: 'Ric Test',
            teamId: PLAYER_TEAM,
            teamName: 'CustomTeam',
            finishingPos: dnf ? 20 : 14,
            startingPos: 21,
            points: 0,
            dnf,
          },
          {
            driverId: 1,
            driverName: 'Rival One',
            teamId: 1,
            teamName: 'Rival',
            finishingPos: 1,
            points: 25,
            dnf: false,
          },
        ],
      },
      {
        raceId: 2,
        seasonId: 3,
        trackId: 10,
        trackName: 'Baku',
        day: 104,
        state: 0,
        isSprint: false,
        laps: 51,
        results: [],
      },
    ],
    ...emptyPhase2Sections(),
  } as SaveModel;
}

beforeEach(() => {
  useSaveStore.setState({ status: 'ready', model: modelWithPlayerResult(false), error: null, progress: null });
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

describe('RaceWeekendView — team result line (v0.7.0 step 1)', () => {
  it('classified finish shows no "false" suffix', () => {
    render(withI18n(<RaceWeekendView model={modelWithPlayerResult(false)} raceId={1} />));
    const line = screen.getByTestId('last-result');
    expect(line).toHaveTextContent('P14 (0 pts)');
    expect(line.textContent).not.toContain('false');
  });

  it('DNF finish appends the " — DNF" marker', () => {
    render(withI18n(<RaceWeekendView model={modelWithPlayerResult(true)} raceId={1} />));
    const line = screen.getByTestId('last-result');
    expect(line.textContent).toContain(' — DNF');
    expect(line.textContent).not.toContain('false');
  });
});
