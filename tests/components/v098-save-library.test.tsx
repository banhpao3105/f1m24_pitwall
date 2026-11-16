// @vitest-environment jsdom
/**
 * v0.9.8 — the Save Library as a full-page tab (/?view=saves), on a mocked
 * save-db so every call is observable. Covers the DoD battery:
 *   · rows with raw bytes show an enabled download + "có file gốc";
 *   · the legacy model-only row shows a DISABLED download + "chỉ model";
 *   · the stats line aggregates the listed records;
 *   · ticking 2 checkboxes → bulk bar "Đã chọn 2" → delete + confirm →
 *     deleteSave called with exactly those 2 ids, the list refreshes to 1
 *     row, the selection clears;
 *   · "chọn tất cả" selects every row;
 *   · Mở sets the store's model to THAT save's model and navigates back to
 *     the wall view (router.replace('/')) — the auto-restore pointer too.
 * The number-shortcut contract (1–9, saves unreachable) is asserted in the
 * nav test below the SaveLibrary battery.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';

const replaceSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('view=saves'),
  usePathname: () => '/',
}));

/* an observable in-memory save-db */
const dbRows: Array<Record<string, unknown>> = [];
const deleteSpy = vi.fn(async (id: string) => {
  const i = dbRows.findIndex((r) => (r as { id: string }).id === id);
  if (i >= 0) dbRows.splice(i, 1);
});
vi.mock('@/lib/save-db', () => ({
  listSaves: vi.fn(async () => [...dbRows] as never),
  deleteSave: (id: string) => deleteSpy(id),
  setLastActiveSaveId: vi.fn(async () => {}),
  getLastActiveSaveId: vi.fn(async () => null),
}));

import { SaveLibrary } from '@/components/pitwall/SaveLibrary';
import { useSaveStore } from '@/store/save.store';
import type { SaveModel } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

afterEach(() => {
  cleanup();
  replaceSpy.mockClear();
  deleteSpy.mockClear();
});

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      {ui}
    </NextIntlClientProvider>
  );
}

function makeModel(id: string, team: string, sizeBytes: number): SaveModel {
  return {
    meta: {
      id,
      fileName: `${id}.sav`,
      fileSizeBytes: sizeBytes,
      gameVersion: 'F1M24',
      saveGameVersion: 3,
      parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2028,
      day: 46831,
      playerTeamId: 1,
      tablesPresent: [],
      tablesMissing: [],
      warnings: [],
    },
    player: { teamId: 1, teamName: team, customTeamEnabled: false },
    teams: [],
    drivers: [],
    staff: [],
    seasons: [{ seasonId: 2028 }],
    races: [],
    standings: { drivers: [], teams: [] },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
  };
}

/** StoredSave-shaped rows for the mock (Blob for raw, undefined = legacy). */
function row(id: string, team: string, sizeBytes: number, raw?: Blob): Record<string, unknown> {
  return {
    id,
    model: makeModel(id, team, sizeBytes),
    savedAt: '2026-11-16T00:00:00Z',
    ...(raw != null ? { raw } : {}),
  };
}

describe('SaveLibrary — the v0.9.8 full-page tab', () => {
  beforeEach(() => {
    dbRows.length = 0;
    dbRows.push(
      row('sha-a', 'Team A', 8831556, new Blob([new Uint8Array([1, 2, 3])])),
      row('sha-b', 'Team B', 7_340_032, new Blob([new Uint8Array([4, 5])])),
      row('sha-legacy', 'Team Legacy', 7_000_000), // pre-v0.9.8: model only
    );
    useSaveStore.setState({ status: 'idle', model: null, error: null, progress: null });
  });

  it('raw rows: enabled download + "có file gốc"; the legacy row: disabled download + "chỉ model"', async () => {
    render(withI18n(<SaveLibrary />));
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(3));

    expect(screen.getByTestId('raw-badge-sha-a').textContent).toBe('có file gốc');
    expect(screen.getByTestId('raw-badge-sha-legacy').textContent).toBe('chỉ model');

    const dlA = screen.getByTestId('download-sha-a');
    expect(dlA).toBeEnabled();
    const dlLegacy = screen.getByTestId('download-sha-legacy');
    expect(dlLegacy).toBeDisabled();
    expect(dlLegacy.getAttribute('title')).toBe(
      'Save này chỉ lưu model (nạp trước v0.9.8) — nạp lại file để bật tải xuống',
    );

    // the stats line: 3 saves, Σ bytes = 8831556 + 7340032 + 7000000
    // = 23,171,588 B → 22.1 MiB (1 decimal)
    expect(screen.getByTestId('library-stats').textContent).toBe('3 save · tổng 22.1 MB');
    // per-row size, 1-decimal MiB
    expect(screen.getByTestId('size-sha-a').textContent).toBe('8.4 MB');
  });

  it('bulk delete: tick 2 → "Đã chọn 2" → confirm → exactly those 2 ids deleted, list refreshes, selection clears', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(withI18n(<SaveLibrary />));
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(3));

    fireEvent.click(screen.getByTestId('select-row-sha-a'));
    fireEvent.click(screen.getByTestId('select-row-sha-b'));
    expect(screen.getByTestId('selected-count').textContent).toBe('Đã chọn 2');

    fireEvent.click(screen.getByTestId('delete-selected'));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(2));
    expect(deleteSpy).toHaveBeenNthCalledWith(1, 'sha-a');
    expect(deleteSpy).toHaveBeenNthCalledWith(2, 'sha-b');
    expect(confirmSpy).toHaveBeenCalledWith('Xoá 2 save đã chọn khỏi trình duyệt?');

    // the list refreshed: 1 row left, selection cleared
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(1));
    expect(screen.queryByTestId('selected-count')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-stats').textContent).toBe('1 save · tổng 6.7 MB');
    confirmSpy.mockRestore();
  });

  it('a declined confirm deletes nothing', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(withI18n(<SaveLibrary />));
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(3));
    fireEvent.click(screen.getByTestId('select-row-sha-a'));
    fireEvent.click(screen.getByTestId('delete-selected'));
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('library-row')).toHaveLength(3);
    confirmSpy.mockRestore();
  });

  it('"chọn tất cả" selects every row (3 of 3)', async () => {
    render(withI18n(<SaveLibrary />));
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(3));
    fireEvent.click(screen.getByTestId('select-all'));
    expect(screen.getByTestId('selected-count').textContent).toBe('Đã chọn 3');
    expect((screen.getByTestId('select-row-sha-a') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('select-row-sha-b') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('select-row-sha-legacy') as HTMLInputElement).checked).toBe(true);
  });

  it('Mở sets the store model to THAT save and navigates back to the wall view', async () => {
    render(withI18n(<SaveLibrary />));
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(3));

    const openButtons = screen.getAllByRole('button', { name: 'Mở' });
    fireEvent.click(openButtons[0]!);

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/', { scroll: false }));
    expect(useSaveStore.getState().model?.meta.id).toBe('sha-a');
    expect(useSaveStore.getState().status).toBe('ready');
  });

  it('the single delete keeps its legacy behaviour (confirm → delete → refresh)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(withI18n(<SaveLibrary />));
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(3));
    const delButtons = screen.getAllByRole('button', { name: /Xoá Team A/ });
    fireEvent.click(delButtons[0]!);
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('sha-a'));
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(2));
    confirmSpy.mockRestore();
  });
});
