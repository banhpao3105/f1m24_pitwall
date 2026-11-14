'use client';

/**
 * Results board — v0.5.6 ("Sức mạnh thực chiến", docs/03 §5.2 companion).
 *
 * Real race RESULTS next to the pace boards: points, points per race, median
 * best finish (with the sample count), DNF/starts, positions gained and the
 * head-to-head record vs the player's team. Read-only facts side by side —
 * deliberately NO weighted "power score" (the prompt forbids invented
 * weights). Same table language as the TimingTower: sticky header, scrolling
 * body, player row highlighted, provenance collapsible at the bottom.
 */

import { useTranslations } from 'next-intl';
import type { EngineResult, SaveModel } from '@/domain/types';
import type { ResultsBoard as ResultsBoardData } from '@/engines/results.engine';
import { ConfidenceBadge } from './ConfidenceBadge';
import { teamPair } from '@/lib/team-colours';
import { cn } from '@/lib/utils';

const fmtMedian = (v: number | null): string =>
  v == null ? '—' : Number.isInteger(v) ? `${v}` : v.toFixed(1);

const fmtSigned = (n: number): string => `${n >= 0 ? '+' : ''}${n}`;

export function ResultsBoardCard({
  board,
  model,
}: {
  board: EngineResult<ResultsBoardData>;
  model: SaveModel;
}) {
  const t = useTranslations('race.results');
  const tSec = useTranslations('sec');

  return (
    <section
      aria-label={t('title')}
      className="rounded-lg border border-line bg-panel p-4"
      data-testid="results-board"
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('results')}</span>
        <h3 className="text-[15px] font-semibold text-ink">{t('title')}</h3>
        <span className="font-mono text-[11px] text-ink-faint">
          {t('window', { count: board.data.racesConsidered })}
        </span>
        <span className="ml-auto">
          <ConfidenceBadge confidence={board.confidence} />
        </span>
      </header>

      <div className="pitwall-scroll max-h-96 overflow-y-auto rounded border border-line">
        <table className="w-full min-w-[560px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-raised">
            <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-1.5 font-medium">{t('colRank')}</th>
              <th className="px-2 py-1.5 font-medium">{t('colTeam')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('colPoints')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('colPerRace')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('colMedian')}</th>
              <th className="px-2 py-1.5 text-center font-medium">{t('colDnf')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('colGained')}</th>
              <th className="px-2 py-1.5 text-center font-medium">{t('colH2h')}</th>
            </tr>
          </thead>
          <tbody>
            {board.data.rows.map((row) => (
              <tr
                key={row.teamId}
                className={cn('border-t border-line', row.isPlayer && 'bg-amber/10')}
                data-testid={row.isPlayer ? 'results-player-row' : undefined}
              >
                <td className="px-2 py-1.5 font-mono text-ink-faint">{row.rank}</td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: teamPair(model, row.teamId).bg }}
                    />
                    <span className={cn('truncate', row.isPlayer ? 'font-medium text-amber' : 'text-ink')}>
                      {row.teamName}
                    </span>
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-ink">{row.points}</td>
                <td className="px-2 py-1.5 text-right font-mono text-ink-soft">{row.pointsPerRace.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-ink-soft">
                  {fmtMedian(row.medianBestFinish)}{' '}
                  <span className="text-[10px] text-ink-faint">(n={row.samples})</span>
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-ink-soft">
                  {row.dnfCount}/{row.starts}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-ink-soft">
                  {fmtSigned(row.positionsGained)}
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-ink-soft">
                  {row.headToHead
                    ? `${row.headToHead.wins}–${row.headToHead.losses}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer select-none text-[11px] font-medium text-ink-faint">
          {t('assumptions')}
        </summary>
        <ul className="mt-1 space-y-1">
          {board.assumptions.map((a, i) => (
            <li key={i} className="text-xs text-ink-faint">— {a.text}</li>
          ))}
          {board.evidence.map((e, i) => (
            <li key={`e${i}`} className="text-xs text-ink-soft">
              <span className="font-mono text-[10px] text-ink-faint">[{e.source}]</span> {e.label}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
