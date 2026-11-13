// @vitest-environment jsdom
/**
 * Phase 2 component tests — docs/05 §9.2 (UI quan trọng có component test).
 * Covers: feedback buttons on RecommendationCard, DriversView (cards + duel),
 * SeasonView (standings + CSV affordance), RaceWeekendView Sim tab,
 * CarLabView degraded state, TyreLabView what-if presence.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { useFeedbackStore } from '@/store/feedback.store';
import { RecommendationCard } from '@/components/pitwall/RecommendationCard';
import { DriversView } from '@/components/pitwall/DriversView';
import { SeasonView } from '@/components/pitwall/SeasonView';
import { RaceWeekendView } from '@/components/pitwall/RaceWeekendView';
import { CarLabView } from '@/components/pitwall/CarLabView';
import { TyreLabView } from '@/components/pitwall/TyreLabView';
import type { SaveModel, Race } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

afterEach(cleanup);

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      {ui}
    </NextIntlClientProvider>
  );
}

const sampleRec = {
  id: 'rec-p2',
  title: 'Khuyến nghị thử nghiệm',
  action: 'Pit ở vòng 12–14',
  why: 'Deg tăng nhanh.',
  confidence: 'MEDIUM' as const,
  evidence: [{ source: 'Races_PitStopTimings', label: 'Pit history 3 chặng' }],
  assumptions: [{ text: 'Trời khô' }],
};

function race(partial: Partial<Race>): Race {
  return {
    raceId: 1, seasonId: 2024, trackId: 1, trackName: 'Sakhir', day: 100,
    state: 2, isSprint: false, laps: 30, results: [], ...partial,
  };
}

const baseModel: SaveModel = {
  meta: {
    id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
    gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
    seasonId: 2024, day: 300, playerTeamId: 1,
    tablesPresent: [], tablesMissing: [], warnings: [],
  },
  player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
  teams: [{ teamId: 1, teamName: 'Player Racing', isCustomTeam: false, formula: 1 }],
  drivers: [
    { staffId: 1, fullName: 'Ace Driver', teamId: 1 },
    { staffId: 2, fullName: 'Backup Driver', teamId: 1 },
  ],
  staff: [],
  seasons: [{ seasonId: 2024 }],
  races: [
    race({
      results: [
        { driverId: 1, driverName: 'Ace Driver', teamId: 1, teamName: 'Player Racing', finishingPos: 1, points: 25, dnf: false, laps: 30 },
        { driverId: 2, driverName: 'Backup Driver', teamId: 1, teamName: 'Player Racing', finishingPos: 2, points: 18, dnf: false, laps: 30 },
      ],
      qualifying: [
        { driverId: 1, driverName: 'Ace Driver', teamId: 1, finishingPos: 1 },
        { driverId: 2, driverName: 'Backup Driver', teamId: 1, finishingPos: 2 },
      ],
      pitStops: [{ driverId: 2, teamId: 1, lap: 12, durationMs: 22_000 }],
    }),
    race({
      raceId: 2, day: 130, state: 1,
    }),
  ],
  standings: {
    drivers: [
      { position: 1, id: 1, name: 'Ace Driver', teamId: 1, points: 25 },
      { position: 2, id: 2, name: 'Backup Driver', teamId: 1, points: 18 },
    ],
    teams: [{ position: 1, id: 1, name: 'Player Racing', points: 43 }],
  },
  tyres: [],
  ...emptyPhase2Sections(),
  availability: [],
};

beforeEach(() => {
  useSaveStore.setState({ status: 'ready', model: baseModel, error: null, progress: null });
  useFeedbackStore.setState({ votes: {} });
  // Radix Slider (what-if) needs ResizeObserver in jsdom
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

describe('RecommendationCard — local feedback', () => {
  it('toggles 👍 and marks saved locally', () => {
    render(withI18n(<RecommendationCard recommendation={sampleRec} />));
    const up = screen.getByTestId('fb-up-rec-p2');
    expect(screen.queryByText('Đã lưu trên máy')).not.toBeInTheDocument();
    fireEvent.click(up);
    expect(screen.getByTestId('fb-up-rec-p2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Đã lưu trên máy')).toBeInTheDocument();
    // toggle again clears
    fireEvent.click(screen.getByTestId('fb-up-rec-p2'));
    expect(screen.queryByText('Đã lưu trên máy')).not.toBeInTheDocument();
  });

  it('👍 and 👎 are mutually exclusive with icon + text labels', () => {
    render(withI18n(<RecommendationCard recommendation={sampleRec} />));
    fireEvent.click(screen.getByTestId('fb-down-rec-p2'));
    expect(screen.getByTestId('fb-down-rec-p2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('fb-up-rec-p2')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Hữu ích')).toBeInTheDocument();
    expect(screen.getByText('Không hữu ích')).toBeInTheDocument();
  });
});

describe('DriversView', () => {
  it('renders driver cards with form and stint metrics', () => {
    render(withI18n(<DriversView model={baseModel} />));
    expect(screen.getByTestId('drivers-view')).toBeInTheDocument();
    // names appear in cards AND select triggers — assert presence, not uniqueness
    expect(screen.getAllByText('Ace Driver').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Backup Driver').length).toBeGreaterThan(0);
    // form chips W / P2 present (P2 also appears as a median — assert ≥1)
    expect(screen.getAllByText('W').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P2').length).toBeGreaterThan(0);
  });

  it('renders the duel panel with h2h counts', () => {
    render(withI18n(<DriversView model={baseModel} />));
    expect(screen.getByTestId('duel-panel')).toBeInTheDocument();
    expect(screen.getByText('Quali thắng')).toBeInTheDocument();
    expect(screen.getByText('Race thắng')).toBeInTheDocument();
  });
});

describe('SeasonView', () => {
  it('renders standings for drivers and teams with player highlight', () => {
    render(withI18n(<SeasonView model={baseModel} />));
    expect(screen.getByTestId('sd-1')).toBeInTheDocument();
    expect(screen.getByTestId('st-1')).toBeInTheDocument();
    expect(screen.getByText('Bảng xếp hạng tay đua')).toBeInTheDocument();
  });

  it('exports a CSV when the button is clicked', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const clickSpy = vi.fn();
    const anchorMock = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement;
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'a' ? anchorMock : originalCreate(tag)) as typeof document.createElement);

    render(withI18n(<SeasonView model={baseModel} />));
    fireEvent.click(screen.getByTestId('export-csv'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0]?.[0];
    expect(blobArg).toBeInstanceOf(Blob);
    vi.restoreAllMocks();
  });
});

describe('RaceWeekendView — Sim tab', () => {
  it('switches to the Sim tab and renders quali + race boards', () => {
    render(withI18n(<RaceWeekendView model={baseModel} raceId={2} />));
    expect(screen.getByTestId('race-weekend')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sim/ }));
    expect(screen.getByTestId('sim-panel')).toBeInTheDocument();
    expect(screen.getByTestId('sim-quali')).toBeInTheDocument();
    expect(screen.getByTestId('sim-race')).toBeInTheDocument();
    expect(screen.getByText('Quali sim — thứ tự xuất phát dự kiến')).toBeInTheDocument();
  });
});

describe('CarLabView', () => {
  it('shows the explicit degraded state when Parts data is missing', () => {
    render(withI18n(<CarLabView model={baseModel} />));
    expect(screen.getByTestId('cars-unavailable')).toBeInTheDocument();
    // pace fallback league still renders
    expect(screen.getByText('League xe')).toBeInTheDocument();
  });
});

describe('TyreLabView — what-if', () => {
  it('renders the what-if section with slider and rain toggle', () => {
    render(withI18n(<TyreLabView model={baseModel} raceId={2} />));
    expect(screen.getByTestId('tyre-whatif')).toBeInTheDocument();
    expect(screen.getByTestId('pit-shift-slider')).toBeInTheDocument();
    expect(screen.getByTestId('rain-toggle')).toBeInTheDocument();
    expect(screen.getByText('Giả lập mưa')).toBeInTheDocument();
  });
});
