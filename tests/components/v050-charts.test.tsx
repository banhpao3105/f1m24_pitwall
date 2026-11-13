// @vitest-environment jsdom
/**
 * v0.5.0 Step 2 — chart component tests.
 * New Recharts surfaces must render real data (regression against the
 * engine-derived numbers) and degrade to fallback text when empty.
 * ResponsiveContainer is stubbed to a fixed size because jsdom has no
 * layout — everything else (bars, labels, reference lines) is the real
 * Recharts output.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';

vi.mock('recharts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('recharts')>();
  // jsdom has no layout: inject the measured size like the real container.
  const Fixed = ({ children }: { children: React.ReactElement<any> }) =>
    React.cloneElement(children, { width: 600, height: 300 });
  return { ...mod, ResponsiveContainer: Fixed };
});

import { PaceBarChart } from '@/components/pitwall/charts/PaceBarChart';
import { DegCurveChart } from '@/components/pitwall/charts/DegCurveChart';
import { CarLeagueChart, PartConditionChart } from '@/components/pitwall/charts/CarLabCharts';
import { StandingsBarChart } from '@/components/pitwall/charts/StandingsBarChart';
import type { PaceTeamRow } from '@/engines/pace.engine';
import type { CarLeagueRow, PartConditionRow } from '@/engines/car.engine';

afterEach(cleanup);

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      {ui}
    </NextIntlClientProvider>
  );
}

function paceRow(partial: Partial<PaceTeamRow>): PaceTeamRow {
  return {
    teamId: 1,
    teamName: 'Team A',
    paceDeltaS: 0.5,
    raceDeltasS: [0.5],
    samples: 2,
    rank: 1,
    isPlayer: false,
    isRival: false,
    ...partial,
  };
}

describe('PaceBarChart', () => {
  it('renders team axis ticks and the baseline label for the fastest team', () => {
    const rows: PaceTeamRow[] = [
      paceRow({ teamId: 1, teamName: 'Alpha', paceDeltaS: 0.0, rank: 1 }),
      paceRow({ teamId: 2, teamName: 'Player Racing', paceDeltaS: 2.287, rank: 2, isPlayer: true, isRival: true }),
      paceRow({ teamId: 3, teamName: 'Gamma', paceDeltaS: 3.1, rank: 3 }),
    ];
    const { container, getByTestId, getByText, getAllByText } = render(withI18n(<PaceBarChart rows={rows} />));
    expect(getByTestId('pace-chart')).toBeInTheDocument();
    expect(getAllByText('Alpha').length).toBeGreaterThan(0);
    expect(getAllByText('Player Racing').length).toBeGreaterThan(0);
    expect(getAllByText('nhanh nhất').length).toBeGreaterThan(0);
    // delta label of the slowest team
    expect(getAllByText('+3.100s').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBe(3);
  });

  it('falls back to text when there is no data', () => {
    const { getByText, queryByTestId } = render(withI18n(<PaceBarChart rows={[]} />));
    expect(queryByTestId('pace-chart')).not.toBeInTheDocument();
    expect(getByText('Chưa đủ dữ liệu pace — nạp save sau chặng kế tiếp.')).toBeInTheDocument();
  });
});

describe('DegCurveChart', () => {
  it('renders three compound curves with pit + cap reference lines', () => {
    const { getByTestId, container } = render(
      withI18n(
        <DegCurveChart
          data={{
            laps: 50,
            deltas: { S: 0, M: 0.55, H: 1.05 },
            lives: { S: 21, M: 32, H: 44 },
            pitLap: 19,
            firstCompound: 'S',
          }}
        />,
      ),
    );
    expect(getByTestId('deg-curve-chart')).toBeInTheDocument();
    expect(container.querySelectorAll('.recharts-line').length).toBe(3);
    expect(container.querySelectorAll('.recharts-reference-line').length).toBe(2); // pit + cap
    expect(container.querySelectorAll('.recharts-reference-area').length).toBe(1);
  });
});

describe('CarLabCharts', () => {
  it('league chart shows inverted pace-rank labels in pace fallback', () => {
    const rows: CarLeagueRow[] = [
      { teamId: 1, teamName: 'Alpha', score: null, rank: 1, isPlayer: false },
      { teamId: 2, teamName: 'Player Racing', score: null, rank: 2, isPlayer: true },
    ];
    const { getByTestId, getAllByText } = render(withI18n(<CarLeagueChart rows={rows} source="pace" />));
    expect(getByTestId('car-league-chart')).toBeInTheDocument();
    expect(getAllByText('P1').length).toBeGreaterThan(0);
    expect(getAllByText('P2').length).toBeGreaterThan(0);
  });

  it('part condition chart draws the WATCH threshold and percentage labels', () => {
    const rows: PartConditionRow[] = [
      { partType: 'Body', count: 2, conditionAvg: 0.94, conditionMin: 0.9, risk: 'LOW', isSupplier: false },
      { partType: 'Wings', count: 2, conditionAvg: 0.61, conditionMin: 0.55, risk: 'WATCH', isSupplier: false },
    ];
    const { getByTestId, getAllByText } = render(withI18n(<PartConditionChart rows={rows} />));
    expect(getByTestId('part-condition-chart')).toBeInTheDocument();
    expect(getAllByText('WATCH 70%').length).toBeGreaterThan(0);
    expect(getAllByText('94%').length).toBeGreaterThan(0);
    expect(getAllByText('61%').length).toBeGreaterThan(0);
  });
});

describe('StandingsBarChart', () => {
  it('renders points for the top rows', () => {
    const { getByTestId, getAllByText } = render(
      withI18n(
        <StandingsBarChart
          rows={[
            { position: 1, id: 11, name: 'McLaren', points: 60 },
            { position: 2, id: 7, name: 'Red Bull Racing', points: 47 },
            { position: 3, id: 5, name: 'Mercedes', points: 39 },
            { position: 4, id: 32, name: 'CustomTeam', points: 20 },
          ]}
          highlightIds={[32]}
          testId="teams-points-chart"
        />,
      ),
    );
    expect(getByTestId('teams-points-chart')).toBeInTheDocument();
    expect(getAllByText('McLaren').length).toBeGreaterThan(0);
    expect(getAllByText('CustomTeam').length).toBeGreaterThan(0);
  });
});
