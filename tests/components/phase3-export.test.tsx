// @vitest-environment jsdom
/**
 * Phase 3 export tests — docs/05 Phase 3 checklist: "Export báo cáo:
 * PDF/print cho Gazette + CSV cho Season". Covers: Gazette print button
 * (window.print stubbed), Season CSV export (Blob with BOM + anchor click).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { GazetteView } from '@/components/pitwall/GazetteView';
import { SeasonView } from '@/components/pitwall/SeasonView';
import { useSaveStore } from '@/store/save.store';
import type { SaveModel, Race } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('view=gazette&race=1'),
  usePathname: () => '/',
}));

afterEach(cleanup);

// v0.6.0: SeasonView mounts the cumulative Recharts area chart — jsdom
// needs a ResizeObserver stub (same pattern as the other component tests).
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

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
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

const model: SaveModel = {
  meta: {
    id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
    gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
    seasonId: 2024, day: 300, playerTeamId: 1,
    tablesPresent: [], tablesMissing: [], warnings: [],
  },
  player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
  teams: [{ teamId: 1, teamName: 'Player Racing', isCustomTeam: false, formula: 0 }],
  drivers: [{ staffId: 1, fullName: 'Ace Driver', teamId: 1 }],
  staff: [],
  seasons: [{ seasonId: 2024 }],
  races: [
    race({
      results: [
        { driverId: 1, driverName: 'Ace Driver', teamId: 1, teamName: 'Player Racing', finishingPos: 1, points: 25, dnf: false, totalTimeMs: 5_400_000 },
      ],
      weather: { raceTempC: 30, raceRain: false, practiceRain: false, qualifyingRain: false },
      trackType: 1,
    }),
  ],
  standings: { drivers: [], teams: [] },
  tyres: [],
  ...emptyPhase2Sections(),
  availability: [],
};

describe('Gazette print export', () => {
  beforeEach(() => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
  });

  it('invokes window.print() from the Gazette toolbar (screen-only button)', () => {
    const printSpy = vi.fn();
    const original = window.print;
    window.print = printSpy;
    try {
      render(withI18n(<GazetteView model={model} raceId={1} />));
      const btn = screen.getByTestId('gazette-print');
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(printSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.print = original;
    }
  });
});

describe('Season CSV export (carried over from Phase 2 — verified here)', () => {
  beforeEach(() => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
  });

  it('creates a blob URL and triggers a download click', () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:mock-1';
    });
    const revokeObjectURL = vi.fn();
    const originalCreate = (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    const originalRevoke = (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.fn();
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = clickSpy;

    try {
      render(withI18n(<SeasonView model={model} />));
      fireEvent.click(screen.getByTestId('export-csv'));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(created[0]).toBeInstanceOf(Blob);
      // BOM so Excel reads UTF-8 Vietnamese names — blob.text() strips the
      // BOM per spec, so assert the raw UTF-8 bytes (EF BB BF) instead.
      return created[0].arrayBuffer().then((buf) => {
        const bytes = new Uint8Array(buf);
        expect(bytes[0]).toBe(0xef);
        expect(bytes[1]).toBe(0xbb);
        expect(bytes[2]).toBe(0xbf);
        expect(new TextDecoder().decode(bytes.slice(3))).toContain('Sakhir');
        expect(clickSpy).toHaveBeenCalled();
        expect(revokeObjectURL).toHaveBeenCalled();
      });
    } finally {
      (URL as unknown as { createObjectURL: unknown }).createObjectURL = originalCreate;
      (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });
});
