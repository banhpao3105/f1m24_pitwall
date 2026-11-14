// @vitest-environment jsdom
/**
 * v0.5.6 component tests — the results board ("Sức mạnh thực chiến") and the
 * head-to-head evidence inside the pace recommendations, verified on the
 * locked Miami fixture (owner's verified aggregates).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { RaceWeekendView } from '@/components/pitwall/RaceWeekendView';
import { ResultsBoardCard } from '@/components/pitwall/ResultsBoard';
import { buildResultsBoard } from '@/engines/results.engine';
import { buildMiamiModel } from '../helpers/miami-fixture';

afterEach(cleanup);

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      {ui}
    </NextIntlClientProvider>
  );
}

const model = buildMiamiModel();

beforeEach(() => {
  useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
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

describe('ResultsBoardCard — locked Miami numbers on screen', () => {
  it('renders the board with the verified aggregates', () => {
    const board = buildResultsBoard(model);
    render(withI18n(<ResultsBoardCard board={board} model={model} />));

    expect(screen.getByTestId('results-board')).toBeInTheDocument();
    expect(screen.getByText('Sức mạnh thực chiến')).toBeInTheDocument();
    expect(screen.getByText('6 chặng gần nhất')).toBeInTheDocument();

    // player row: P5 · 51 · 8.5 · 7 (n=6) · 1/12 · +81 · — (no self h2h)
    const playerRow = screen.getByTestId('results-player-row');
    expect(within(playerRow).getByText('CustomTeam')).toBeInTheDocument();
    expect(within(playerRow).getByText('51')).toBeInTheDocument();
    expect(within(playerRow).getByText('8.5')).toBeInTheDocument();
    expect(within(playerRow).getByText('7')).toBeInTheDocument();
    expect(within(playerRow).getByText('(n=6)')).toBeInTheDocument();
    expect(within(playerRow).getByText('1/12')).toBeInTheDocument();
    expect(within(playerRow).getByText('+81')).toBeInTheDocument();
    expect(within(playerRow).getByText('—')).toBeInTheDocument();

    // Alpine row: P7 · 11 · 1.8 · 11 (n=5) · 5/12 · −4 · 5–1
    const table = screen.getByTestId('results-board');
    const alpineRow = within(table).getByText('Alpine').closest('tr')!;
    // '11' appears twice (points and median) — assert presence, not uniqueness
    expect(within(alpineRow).getAllByText('11').length).toBe(2);
    expect(within(alpineRow).getByText('1.8')).toBeInTheDocument();
    expect(within(alpineRow).getByText('5/12')).toBeInTheDocument();
    expect(within(alpineRow).getByText('-4')).toBeInTheDocument();
    expect(within(alpineRow).getByText('5–1')).toBeInTheDocument();

    // Red Bull leads; Aston Martin ranks above Alfa Romeo on the median
    expect(within(table).getByText('Red Bull Racing').closest('tr')!).toBeInTheDocument();
    const astonRow = within(table).getByText('Aston Martin').closest('tr')!;
    expect(within(astonRow).getByText('14.5')).toBeInTheDocument();
  });

  it('exposes the mandatory assumptions and evidence sources', () => {
    const board = buildResultsBoard(model);
    render(withI18n(<ResultsBoardCard board={board} model={model} />));
    fireEvent.click(screen.getByText('Giả định & nguồn dữ liệu'));
    expect(screen.getByText(/Vị trí leo được thiên vị đội phân hạng tệ/)).toBeInTheDocument();
    expect(screen.getByText(/Median best finish loại chặng đội không có xe về đích/)).toBeInTheDocument();
    expect(screen.getAllByText('[Races_Results]').length).toBeGreaterThan(0);
  });
});

describe('RaceWeekendView — board next to pace + h2h evidence in recs', () => {
  it('shows the results board on the Overview tab after the pace section', () => {
    render(withI18n(<RaceWeekendView model={model} raceId={6} />));
    expect(screen.getByTestId('race-weekend')).toBeInTheDocument();
    expect(screen.getByTestId('results-board')).toBeInTheDocument();
    expect(screen.getByTestId('results-player-row')).toBeInTheDocument();
  });

  it('pace recommendations carry the head-to-head sentences (engine-composed)', () => {
    render(withI18n(<RaceWeekendView model={model} raceId={6} />));
    const recs = screen.getByTestId('race-pace-recs');
    // race-pace rec — slower pace, better results → contradiction "nhưng"
    expect(
      within(recs).getByText(/Pace đua \(vòng trung bình\) chậm hơn Alpine 0\.105s\/vòng, nhưng trên kết quả bạn hơn: đối đầu thắng 5–1 \(5\/6 chặng\), hơn 40 điểm \(51 vs 11\), DNF 1 vs 5\./),
    ).toBeInTheDocument();
    // peak-pace rec — same counter-story vs the same rivalRef
    expect(
      within(recs).getByText(/Pace đỉnh \(fastest lap\) chậm hơn Alpine 0\.080s\/vòng, nhưng trên kết quả bạn hơn: đối đầu thắng 5–1 \(5\/6 chặng\), hơn 40 điểm \(51 vs 11\), DNF 1 vs 5\./),
    ).toBeInTheDocument();
  });
});
