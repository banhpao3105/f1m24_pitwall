// @vitest-environment jsdom
/**
 * v0.9.8 — the routing/nav contract for the saves tab:
 *   · /?view=saves resolves to the library through WallViews (even with a
 *     model open, where WallViews renders it like any other view);
 *   · other views keep their behaviour (no library rendered there);
 *   · the palette module list: 10 modules, saves LAST with NO shortcut,
 *     the original nine keep shortcuts 1–9 — the number-key contract is
 *     untouched.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';

const replaceSpy = vi.fn();
let searchParams = 'view=saves';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParams),
  usePathname: () => '/',
}));

const dbRows: Array<Record<string, unknown>> = [];
vi.mock('@/lib/save-db', () => ({
  listSaves: vi.fn(async () => [...dbRows] as never),
  deleteSave: vi.fn(async () => {}),
  setLastActiveSaveId: vi.fn(async () => {}),
  getLastActiveSaveId: vi.fn(async () => null),
}));

import { WallViews } from '@/components/pitwall/WallViews';
import { CommandPalette, COMMAND_PALETTE_MODULES } from '@/components/pitwall/CommandPalette';
import { useSaveStore } from '@/store/save.store';
import { useUiStore } from '@/store/ui.store';
import type { SaveModel } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

afterEach(cleanup);

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      {ui}
    </NextIntlClientProvider>
  );
}

const model: SaveModel = {
  meta: {
    id: 't', fileName: 't.sav', fileSizeBytes: 1,
    gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
    seasonId: 2024, day: 200, playerTeamId: 1,
    tablesPresent: [], tablesMissing: [], warnings: [],
  },
  player: { teamId: 1, teamName: 'P', customTeamEnabled: false },
  teams: [], drivers: [], staff: [], seasons: [{ seasonId: 2024 }],
  races: [],
  standings: { drivers: [], teams: [] },
  tyres: [],
  ...emptyPhase2Sections(),
  availability: [],
};

describe('v0.9.8 nav — /?view=saves is a real view', () => {
  beforeEach(() => {
    searchParams = 'view=saves';
    dbRows.length = 0;
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    useUiStore.setState({ locale: 'vi', paletteOpen: false });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('WallViews renders the library tab on /?view=saves', async () => {
    render(withI18n(<WallViews />));
    await waitFor(() => expect(screen.getByTestId('save-library')).toBeInTheDocument());
  });

  it('another view does NOT render the library (the case switch stays exact)', () => {
    searchParams = 'view=tyres';
    render(withI18n(<WallViews />));
    expect(screen.queryByTestId('save-library')).not.toBeInTheDocument();
    // the tyres view rendered (the minimal model has no races → its no-race
    // state, which is exactly the known rendering)
    expect(screen.getByText('Không có chặng nào để phân tích.')).toBeInTheDocument();
  });

  it('the palette module list: 9 numbered views unchanged + saves last, NO shortcut', () => {
    const mods = COMMAND_PALETTE_MODULES;
    expect(mods).toHaveLength(10);
    expect(mods.slice(0, 9).map((m) => m.key)).toEqual([
      'wall', 'tyres', 'race', 'cars', 'drivers', 'season', 'strategy', 'research', 'gazette',
    ]);
    expect(mods.slice(0, 9).map((m) => m.shortcut)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    const saves = mods[9]!;
    expect(saves.key).toBe('saves');
    expect(saves.shortcut).toBe('');
    expect(saves.mode).toBe('S');
  });

  it('the palette renders "Kho save" without an empty shortcut badge', () => {
    useUiStore.setState({ paletteOpen: true });
    render(withI18n(<CommandPalette races={[]} />));
    const item = screen.getByText('Kho save').closest('[cmdk-item]') ?? screen.getByText('Kho save').parentElement!;
    // the label renders; there is no badge span with an empty string inside
    const badges = item.querySelectorAll('span.rounded.border');
    for (const b of badges) expect(b.textContent).not.toBe('');
    expect(screen.getByText('Kho save')).toBeInTheDocument();
  });
});
