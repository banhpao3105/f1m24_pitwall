// @vitest-environment jsdom
/**
 * Phase 3 component tests — GazetteView (docs/05 §9.2: UI quan trọng có
 * component test). Covers: masthead + headline rendering, awards +
 * deterministic quote, results table with gap, transfers section, next
 * race preview + deep-link button, degraded not-completed state.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { GazetteView } from '@/components/pitwall/GazetteView';
import type { SaveModel, Race } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

// GazetteView + WallNav use useSearchParams — Next.js app router context
// is unavailable in jsdom, so stub the router modules.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('view=gazette&race=1'),
  usePathname: () => '/',
}));

beforeEach(() => {
  useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
});

afterEach(cleanup);

function withI18n(ui: React.ReactElement, locale: 'vi' | 'en' = 'vi') {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Shanghai">
      {ui}
    </NextIntlClientProvider>
  );
}

function race(partial: Partial<Race>): Race {
  return {
    raceId: 1, seasonId: 2024, trackId: 1, trackName: 'Sakhir', day: 100,
    state: 2, isSprint: false, laps: 30, results: [], ...partial,
  };
}

function result(
  driverId: number, driverName: string, teamId: number, teamName: string,
  finishingPos: number, extra: Partial<Race['results'][number]> = {},
): Race['results'][number] {
  return {
    driverId, driverName, teamId, teamName, finishingPos,
    points: Math.max(0, 25 - (finishingPos - 1) * 5),
    dnf: false, ...extra,
  };
}

const model: SaveModel = {
  meta: {
    id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
    gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
    seasonId: 2024, day: 300, playerTeamId: 1,
    tablesPresent: [], tablesMissing: [], warnings: [],
  },
  player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
  teams: [
    { teamId: 1, teamName: 'Player Racing', isCustomTeam: false, formula: 0 },
    { teamId: 2, teamName: 'Rival Racing', isCustomTeam: false, formula: 0 },
  ],
  drivers: [
    { staffId: 1, fullName: 'Ace Driver', teamId: 1 },
    { staffId: 2, fullName: 'Backup Driver', teamId: 1 },
    { staffId: 3, fullName: 'Rival Star', teamId: 2 },
  ],
  staff: [],
  seasons: [{ seasonId: 2024 }],
  races: [
    race({
      results: [
        result(1, 'Ace Driver', 1, 'Player Racing', 1, { startingPos: 1, totalTimeMs: 5_400_000, fastestLapMs: 90_000 }),
        result(2, 'Backup Driver', 1, 'Player Racing', 2, { startingPos: 3, totalTimeMs: 5_401_000, overtakes: 2 }),
        result(3, 'Rival Star', 2, 'Rival Racing', 3, { startingPos: 2, totalTimeMs: 5_402_000, dnf: false }),
      ],
      weather: { raceTempC: 30, raceRain: false, practiceRain: false, qualifyingRain: true },
      trackType: 1, trackLengthKm: 5.4, trackFirstRaceYear: 2004, trackFastestLapMs: 90_000,
      pitStops: [{ driverId: 2, teamId: 1, lap: 12, durationMs: 22_000 }],
    }),
    race({ raceId: 2, day: 130, state: 1, results: [], trackType: 1 }),
  ],
  standings: { drivers: [], teams: [] },
  tyres: [],
  ...emptyPhase2Sections(),
  availability: [],
};

describe('GazetteView', () => {
  it('renders the masthead, headline and race table for a completed race', () => {
    render(withI18n(<GazetteView model={model} raceId={1} />));
    expect(screen.getByTestId('gazette-view')).toBeInTheDocument();
    // VI nameplate accent word
    expect(screen.getByText(/Tạp chí/)).toBeInTheDocument();
    // headline: winner started P1 → wire-to-wire headline (VI)
    expect(screen.getByText(/DẪN ĐẦU TỪ ĐẦU ĐẾN CUỐI/)).toBeInTheDocument();
    // results table shows all 3 drivers + winner chip (name repeats: table + quote)
    expect(screen.getAllByText('Ace Driver').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rival Star').length).toBeGreaterThan(0);
    // gap column: P2 = +1.000s
    expect(screen.getByText('+1.000s')).toBeInTheDocument();
    // overtakes column from Races_Results.SuccessfulOvertakes (cell + award count)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('shows awards, best pit and the deterministic winner quote', () => {
    render(withI18n(<GazetteView model={model} raceId={1} />));
    expect(screen.getByTestId('gazette-awards')).toBeInTheDocument();
    // winner + fastest lap merged into the winner card (same driver)
    expect(screen.getByText(/Vòng đua nhanh nhất: 1:30\.000/)).toBeInTheDocument();
    // best pit from Races_PitStopTimings (award card + highlight row)
    expect(screen.getAllByText(/22\.00s/).length).toBeGreaterThan(0);
    // quote block from the deterministic bank
    expect(screen.getAllByText(/— Ace Driver/).length).toBeGreaterThan(0);
  });

  it('lists transfers from future contracts with quotes', () => {
    const withTransfer: SaveModel = {
      ...model,
      personnel: {
        ...model.personnel,
        tablesPresent: { ...model.personnel.tablesPresent, contracts: true },
        contracts: [
          { staffId: 3, teamId: 1, contractType: 3, startDay: 45_000, endSeason: 2025 },
        ],
      },
    };
    // the engine reads the model from the store, not from props
    useSaveStore.setState({ status: 'ready', model: withTransfer, error: null, progress: null });
    render(withI18n(<GazetteView model={withTransfer} raceId={1} />));
    expect(screen.getByTestId('gazette-transfers')).toBeInTheDocument();
    expect(screen.getAllByText('Rival Star').length).toBeGreaterThan(0);
    expect(screen.getByText(/cho mùa giải 2023/)).toBeInTheDocument();
  });

  it('links to the Pit Wall for the next race (deep-link contract)', () => {
    render(withI18n(<GazetteView model={model} raceId={1} />));
    const btn = screen.getByTestId('gazette-open-race');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn); // must not throw — replace() is mocked
  });

  it('degrades for a not-yet-run race and keeps the layout alive', () => {
    render(withI18n(<GazetteView model={model} raceId={2} />));
    expect(screen.getByTestId('gazette-view')).toBeInTheDocument();
    expect(screen.getByText(/chưa hoàn thành/)).toBeInTheDocument();
  });

  it('renders in English without VI text leaking (i18n rule docs/05 §9.4)', () => {
    render(withI18n(<GazetteView model={model} raceId={1} />, 'en'));
    expect(screen.getByText('Weekend Awards')).toBeInTheDocument();
    expect(screen.getByText('Race Highlights')).toBeInTheDocument();
    expect(screen.getByText(/LEADS START TO FINISH/)).toBeInTheDocument();
    expect(screen.queryByText(/Giải thưởng của cuối tuần/)).not.toBeInTheDocument();
  });
});
