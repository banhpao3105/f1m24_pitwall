'use client';

/**
 * Gazette view — Phase 3 (docs/04 §7.3.6): narrative module ported from the
 * Gazette v2.2 oracle. Masthead + headline + race report + standings +
 * awards + transfers + highlights + next-race preview, rendered as
 * components (never a template string) and fully i18n'd. Numbers come from
 * the Gazette engine (oracle formulas); the engine returns slots, this
 * component composes sentences via next-intl — no bare strings.
 *
 * Print/export lands in the Phase 3 export step; the component is
 * print-ready via a dedicated `gazette-sheet` wrapper.
 */

import { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Award,
  BookOpen,
  ChevronRight,
  Clock,
  Flag,
  Newspaper,
  Printer,
  ShieldCheck,
  Timer,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { useGazette } from '@/lib/engine-hooks';
import { useWallNav } from './WallNav';
import { ConfidenceBadge } from './ConfidenceBadge';
import { TeamDot } from './TeamIdentity';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ── formatting helpers (oracle format.js parity, ms-based model) ── */

function formatLapTime(ms: number | undefined): string {
  if (ms == null) return '—';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(3);
  return m > 0 ? `${m}:${rest.padStart(6, '0')}` : `${rest}s`;
}

function formatGap(gapS: number | undefined): string {
  if (gapS == null) return '—';
  if (gapS === 0) return 'WIN';
  return `+${gapS.toFixed(3)}s`;
}

function formatPitTime(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function toRoman(num: number): string {
  const ROMAN: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = Math.max(1, Math.round(num));
  let out = '';
  for (const [v, s] of ROMAN) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

/* quote bank reader — next-intl stores arrays; engine picks the index. */
function bank(t: ReturnType<typeof useTranslations>, key: string): string[] {
  const raw = t.raw(key);
  return Array.isArray(raw) ? (raw as string[]) : [];
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}

function Section({ title, icon, children, testId }: SectionProps) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="rounded-lg border border-line bg-panel p-4 print:break-inside-avoid print:border-line/60"
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-gold" aria-hidden="true">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function GazetteView({ model, raceId }: { model: SaveModel; raceId: number | null }) {
  const t = useTranslations('gazette');
  const locale = useLocale();
  const { setView } = useWallNav();
  const isVi = locale !== 'en';

  const seasons = useMemo(
    () => model.races.filter((r) => r.state === 2).sort((a, b) => b.day - a.day),
    [model.races],
  );
  const activeRaceId = raceId ?? seasons[0]?.raceId ?? null;
  // Engine keys on the ACTIVE race (query param → latest completed race).
  const gazette = useGazette(activeRaceId);

  if (raceId == null && activeRaceId == null) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6 text-center text-sm text-ink-soft" data-testid="gazette-view">
        <Newspaper className="mx-auto mb-2 h-6 w-6 text-ink-faint" aria-hidden="true" />
        {t('notCompleted')}
      </div>
    );
  }
  if (!gazette) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6 text-center text-sm text-ink-soft" data-testid="gazette-view">
        {t('notFound')}
      </div>
    );
  }

  const issue = gazette.data;
  // Display name for the raw Races_Tracks key (oracle TRACKS map).
  const track = trackDisplay(issue.trackName, locale as 'vi' | 'en');
  const winner = issue.winner;
  const p2 = issue.results.find((r) => r.finishPos === 2);

  /* headline/subhead — composed per oracle narrative.js:17062 */
  const headline =
    winner == null
      ? t('notCompleted')
      : issue.wireToWire
        ? t('headline.wireToWire', {
            driver: winner.driverName.toUpperCase(),
            track: track.toUpperCase(),
          })
        : t('headline.fromPos', {
            driver: winner.driverName.toUpperCase(),
            pos: issue.results[0]?.startPos ?? '—',
            track: track.toUpperCase(),
          });

  const gapP2 = p2?.gapS != null ? `+${p2.gapS.toFixed(3)}s` : null;
  const subhead =
    winner == null
      ? undefined
      : p2 == null
        ? t('subhead.solo', { driver: winner.driverName, team: winner.teamName })
        : issue.wireToWire
          ? t('subhead.wireToWire', {
              driver: winner.driverName,
              team: winner.teamName,
              p2: p2.driverName,
              p2Team: p2.teamName,
              gap: gapP2 ?? '—',
            })
          : t('subhead.fromPos', {
              driver: winner.driverName,
              pos: issue.results[0]?.startPos ?? '—',
              team: winner.teamName,
              p2: p2.driverName,
              p2Team: p2.teamName,
              gap: gapP2 ?? '—',
            });

  /* narrative paragraphs — same structure as buildNarrative (oracle n:17054) */
  const w = issue.weather;
  const wetPq = (w.practiceRain ?? false) || (w.qualifyingRain ?? false);
  const weatherLine = !w
    ? null
    : w.raceRain == null && w.practiceRain == null && w.qualifyingRain == null
      ? t('narrative.weatherNoData')
      : !w.raceRain && !wetPq
        ? t('narrative.weatherDryAll')
        : w.raceRain && wetPq
          ? t('narrative.weatherWetAll')
          : wetPq && !w.raceRain
            ? t('narrative.weatherWetPq')
            : !wetPq && w.raceRain
              ? t('narrative.weatherWetRace')
              : t('narrative.weatherMixed');

  const agg = issue.aggregates;
  const sc = agg.safetyCars;
  const vsc = agg.virtualSafetyCars;
  const scLine =
    sc == null && vsc == null
      ? t('narrative.scNoData')
      : sc != null && vsc != null && sc > 0 && vsc > 0
        ? t('narrative.scBoth', { sc, vsc })
        : sc != null && sc > 0
          ? t('narrative.scOnly', { sc })
          : vsc != null && vsc > 0
            ? t('narrative.vscOnly', { vsc })
            : t('narrative.cleanRace');

  const para2Parts: string[] = [];
  if (agg.overtakesAvailable) {
    para2Parts.push(t('narrative.overtakes', { count: agg.totalOvertakes ?? 0 }));
  }
  para2Parts.push(t('narrative.retirements', { count: agg.retirements }));
  para2Parts.push(scLine);

  const fl = issue.fastestLap;
  const para3 =
    fl == null
      ? null
      : fl.isTrackRecord && issue.trackFirstRaceYear != null
        ? t('narrative.flRecord', {
            driver: fl.driverName,
            team: fl.teamName,
            time: formatLapTime(fl.lapMs),
            track: track,
            year: issue.trackFirstRaceYear,
          })
        : t('narrative.fl', {
            driver: fl.driverName,
            team: fl.teamName,
            time: formatLapTime(fl.lapMs),
          });

  const standingsDrivers = issue.standings.drivers;
  const standingsTeams = issue.standings.teams;
  const leader = standingsDrivers[0];
  const second = standingsDrivers[1];
  const para4 =
    leader != null && second != null
      ? t('narrative.lead', {
          leader: leader.name,
          team: standingsTeams.find((s) => s.id === leader.teamId)?.name ?? '',
          points: leader.points,
          second: second.name,
          gap: leader.points - second.points,
        })
      : null;

  const teamWatchLines: string[] = [];
  const tw = issue.playerTeamWatch;
  if (tw) {
    for (const d of tw.drivers) {
      if (d.dnf) teamWatchLines.push(t('narrative.teamWatchDnf', { driver: d.driverName }));
      else if (d.points > 0)
        teamWatchLines.push(t('narrative.teamWatchLine', { driver: d.driverName, pos: d.finishPos, points: d.points }));
      else teamWatchLines.push(t('narrative.teamWatchNoPts', { driver: d.driverName, pos: d.finishPos }));
    }
  }

  /* quote banks + deterministic slots */
  const winnerQuotes = bank(t, `quotes.winner.${issue.quoteSlots.winner.category}`);
  const winnerQuoteText =
    winnerQuotes[issue.quoteSlots.winner.index] ?? winnerQuotes[0] ?? null;
  const randomQuotes = issue.quoteSlots.random
    ? bank(t, `quotes.random.${issue.quoteSlots.random.category}`)
    : [];
  const randomQuoteText =
    issue.quoteSlots.random != null
      ? (randomQuotes[issue.quoteSlots.random.index] ?? randomQuotes[0] ?? null)
      : null;

  const trackTypeLabel = (type: number | undefined): string | null =>
    type == null
      ? null
      : type === 1
        ? t('nextRace.trackType1')
        : type === 2
          ? t('nextRace.trackType2')
          : t('nextRace.trackType0');

  const fav = issue.favorites;
  const nr = issue.nextRace;

  return (
    <div className="space-y-5" data-testid="gazette-view">
      {/* print toolbar — screen only (docs/05 Phase 3: PDF/print export) */}
      <div className="flex justify-end print:hidden">
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.print()}
          data-testid="gazette-print"
          className="cursor-pointer gap-1.5 border-line bg-surface text-ink-soft hover:text-ink"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          {t('printButton')}
        </Button>
      </div>

      {/* masthead — persistent identity header (oracle v2.1) */}
      <header className="gazette-sheet rounded-lg border border-gold/30 bg-panel px-4 py-5 text-center print:border-line">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          <span>
            {t('masthead.vol')} {toRoman(issue.round)} · {t('masthead.no')} {issue.raceId}
          </span>
          <span>
            {t('masthead.season')} {issue.seasonId}
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {isVi ? (
            <>
              Tạp chí <span className="text-gold">Đường Đua</span>
            </>
          ) : (
            <>
              The <span className="text-gold">Circuit</span> Gazette
            </>
          )}
        </h2>
        <p className="mt-1 text-xs text-ink-soft">{t('masthead.tagline')}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          <span className="font-medium text-ink">
            {t('masthead.round')} {issue.round} · {track}
          </span>
          {w?.raceTempC != null ? (
            <span>
              {t('dateline.temp', { temp: w.raceTempC.toFixed(1) })},{' '}
              {w.raceRain ? t('dateline.wet') : t('dateline.dry')}
            </span>
          ) : (
            <span>{t('dateline.noWeather')}</span>
          )}
          {issue.laps != null ? <span className="font-mono">{issue.laps} laps</span> : null}
        </div>
      </header>

      {/* front page: headline + race report */}
      <section
        aria-label={t('masthead.round')}
        className="rounded-lg border border-line bg-panel p-4 sm:p-6 print:break-inside-avoid"
      >
        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-gold">
          {t('masthead.round')} {issue.round}/{issue.totalRounds}
        </p>
        <h3 className="text-xl font-bold leading-tight text-ink sm:text-2xl">{headline}</h3>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-faint">
          <span>{track}</span>
          <span aria-hidden="true">·</span>
          <ConfidenceBadge confidence={gazette.confidence} />
        </div>

        <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-ink sm:columns-2 sm:gap-8 [&>p]:break-inside-avoid [&>blockquote]:break-inside-avoid">
          {winner != null && p2 != null ? (
            <p className="gazette-dropcap">
              {issue.wireToWire
                ? t('subhead.wireToWire', {
                    driver: winner.driverName,
                    team: winner.teamName,
                    p2: p2.driverName,
                    p2Team: p2.teamName,
                    gap: gapP2 ?? '—',
                  })
                : t('subhead.fromPos', {
                    driver: winner.driverName,
                    pos: issue.results[0]?.startPos ?? '—',
                    team: winner.teamName,
                    p2: p2.driverName,
                    p2Team: p2.teamName,
                    gap: gapP2 ?? '—',
                  })}
            </p>
          ) : null}
          {weatherLine != null ? <p>{weatherLine}</p> : null}
          <p>{para2Parts.join(' ')}</p>
          {/* pull quote — the winner's line, front-page style (v0.5.0 step 5) */}
          {winnerQuoteText != null && winner != null ? (
            <blockquote
              className="my-3 break-inside-avoid border-l-2 border-gold/60 pl-3 text-base font-medium italic leading-snug text-ink"
              data-testid="gazette-pullquote"
            >
              “{winnerQuoteText}”
              <footer className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint not-italic">
                {t('quotes.quoteFrom', { name: winner.driverName })}
              </footer>
            </blockquote>
          ) : null}
          {para3 != null ? <p>{para3}</p> : null}
          {para4 != null ? <p>{para4}</p> : null}
        </div>

        {/* results table */}
        <div className="mt-5 max-h-96 overflow-y-auto pitwall-scroll" data-testid="gazette-results">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="sticky top-0 bg-panel">
              <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                <th className="px-2 py-1.5">{t('colPos')}</th>
                <th className="px-2 py-1.5">{t('colGrid')}</th>
                <th className="px-2 py-1.5">{t('colDriver')}</th>
                <th className="px-2 py-1.5">{t('colTeam')}</th>
                <th className="px-2 py-1.5 text-right">{t('colGap')}</th>
                <th className="px-2 py-1.5 text-right">{t('colOv')}</th>
                <th className="px-2 py-1.5 text-right">{t('colPts')}</th>
              </tr>
            </thead>
            <tbody>
              {issue.results.map((r) => {
                const isPlayer = r.teamId === model.player.teamId;
                return (
                  <tr
                    key={r.driverId}
                    className={cn('border-t border-line/60', isPlayer && 'bg-amber/5')}
                  >
                    <td className="px-2 py-1.5 font-mono text-ink">{r.dnf ? t('dnf') : `P${r.finishPos}`}</td>
                    <td className="px-2 py-1.5 font-mono text-ink-faint">{r.startPos ?? '—'}</td>
                    <td className="px-2 py-1.5 text-ink">
                      <span className="flex items-center gap-1.5">
                        <TeamDot model={model} teamId={r.teamId} />
                        {r.driverName}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-ink-soft">{r.teamName}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-ink-soft">{formatGap(r.gapS)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-ink-soft">
                      {r.overtakes ?? t('noDataCol')}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-gold">{r.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* v0.5.0 step 5 — newspaper body: main column + right sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-8">
      {/* awards + highlights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={t('awards.title')} icon={<Award className="h-4 w-4" />} testId="gazette-awards">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {winner != null ? (
              <AwardCard
                label={t('awards.winner')}
                name={winner.driverName}
                sub={
                  fl != null && fl.driverId === winner.driverId
                    ? `${winner.teamName} · ${t('awards.flSuffix', { time: formatLapTime(fl.lapMs) })}`
                    : winner.teamName
                }
              />
            ) : null}
            {fl != null && fl.driverId !== winner?.driverId ? (
              <AwardCard
                label={t('awards.fastestLap')}
                name={fl.driverName}
                sub={`${formatLapTime(fl.lapMs)} — ${fl.teamName}`}
              />
            ) : null}
            {issue.bestPit != null ? (
              <AwardCard
                label={t('awards.pit')}
                name={issue.bestPit.driverName}
                sub={`${formatPitTime(issue.bestPit.durationMs)} — ${issue.bestPit.teamName}`}
              />
            ) : null}
            {issue.comeback != null ? (
              <AwardCard
                label={t('awards.comeback')}
                name={issue.comeback.driverName}
                sub={t('awards.comebackCaption', {
                  name: issue.comeback.driverName,
                  from: issue.comeback.startPos,
                  to: issue.comeback.finishPos,
                })}
              />
            ) : null}
          </div>
          <p className="mt-3 border-t border-line/60 pt-2 text-[11px] text-ink-faint">
            {t('awards.dotdUnavailable')}
          </p>
          {randomQuoteText != null && issue.quoteSlots.random != null ? (
            <QuoteBlock
              name={issue.quoteSlots.random.driverName}
              text={randomQuoteText}
            />
          ) : null}
        </Section>

        <Section title={t('highlights.title')} icon={<Flag className="h-4 w-4" />}>
          <ul className="space-y-2 text-sm">
            {issue.podium.length === 3 ? (
              <HighlightRow
                icon={<Trophy className="h-3.5 w-3.5" />}
                label={t('highlights.podium')}
                value={issue.podium.map((p) => p.driverName).join(' · ')}
              />
            ) : null}
            {fl != null ? (
              <HighlightRow
                icon={<Timer className="h-3.5 w-3.5" />}
                label={t('highlights.fastestLap')}
                value={`${fl.driverName} — ${formatLapTime(fl.lapMs)}${fl.isTrackRecord ? ' (record)' : ''}`}
              />
            ) : null}
            {issue.bestPit != null ? (
              <HighlightRow
                icon={<Clock className="h-3.5 w-3.5" />}
                label={t('highlights.pitStop')}
                value={`${issue.bestPit.driverName} (${issue.bestPit.teamName}) — ${formatPitTime(issue.bestPit.durationMs)}`}
              />
            ) : null}
            {winner != null ? (
              <HighlightRow icon={<Flag className="h-3.5 w-3.5" />} label={t('highlights.chequered')} value={winner.driverName} />
            ) : null}
            {issue.comeback != null ? (
              <HighlightRow
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label={t('highlights.comeback')}
                value={t('awards.comebackCaption', {
                  name: issue.comeback.driverName,
                  from: issue.comeback.startPos,
                  to: issue.comeback.finishPos,
                })}
              />
            ) : null}
          </ul>
        </Section>
      </div>

      {/* transfers */}
      <Section title={t('transfers.title')} icon={<ArrowRight className="h-4 w-4" />} testId="gazette-transfers">
        {issue.transfers.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('transfers.empty')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {issue.transfers.map((tr) => {
              const isPlayer = tr.futTeamId === model.player.teamId;
              const qBank = bank(t, `transfers.quote.${tr.quoteCategory}`);
              const quoteText = qBank[tr.quoteIndex] ?? qBank[0];
              return (
                <motion.li
                  key={tr.driverId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'rounded border px-3 py-2.5',
                    isPlayer ? 'border-amber/40 bg-amber/5' : 'border-line bg-surface',
                  )}
                >
                  <p className="text-sm font-medium text-ink">{tr.driverName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-soft">
                    {tr.curTeamName ?? '—'}
                    <ChevronRight className="h-3 w-3 text-gold" aria-hidden="true" />
                    <span className="text-ink">{tr.futTeamName}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-faint">
                    {tr.effectiveSeason != null
                      ? t('transfers.joinsFor', { season: tr.effectiveSeason })
                      : tr.contractEndSeason != null
                        ? t('transfers.untilSeason', { season: tr.contractEndSeason })
                        : ''}
                  </p>
                  {quoteText != null ? (
                    <p className="mt-2 border-l-2 border-gold/50 pl-2 text-xs italic text-ink-soft">
                      “{quoteText}”
                      <span className="ml-1 not-italic text-ink-faint">
                        {t('quotes.quoteFrom', { name: tr.driverName })}
                      </span>
                    </p>
                  ) : null}
                </motion.li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* next race preview — header row stays in the main column (v0.5.0:
          trivia / odds / dark-horse moved to the right sidebar) */}
      <Section title={t('nextRace.title')} icon={<BookOpen className="h-4 w-4" />} testId="gazette-next">
        {nr == null ? (
          <p className="text-sm text-ink-soft">{t('nextRace.noNext')}</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-semibold text-ink">{trackDisplay(nr.trackName, locale as 'vi' | 'en')}</span>
            {trackTypeLabel(nr.trackType) != null ? (
              <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-soft">
                {trackTypeLabel(nr.trackType)}
              </span>
            ) : null}
            <span className="font-mono text-xs text-gold">
              {nr.isCompleted
                ? t('nextRace.alreadyRun')
                : nr.daysAway <= 0
                  ? t('nextRace.thisWeekend')
                  : t('nextRace.daysAway', { days: nr.daysAway })}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto cursor-pointer gap-1.5 border-teal/40 bg-teal/5 text-teal hover:bg-teal/10"
              onClick={() => setView('race', nr.raceId)}
              data-testid="gazette-open-race"
            >
              {t('openInPitWall')}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </Section>


      {/* team watch + provenance footer */}
      <Section title={model.player.teamName} icon={<ShieldCheck className="h-4 w-4" />}>
        {tw && teamWatchLines.length > 0 ? (
          <div className="space-y-1.5 text-sm text-ink">
            <p>{t('narrative.teamWatchSummary', { lines: teamWatchLines.join(', '), team: model.player.teamName })}</p>
            {tw.standing ? (
              <p className="text-xs text-ink-soft">
                {t('narrative.teamWatchStanding', { pos: tw.standing.position, points: tw.standing.points })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">{t('notFound')}</p>
        )}
        <ul className="mt-3 space-y-1 border-t border-line/60 pt-2 text-[11px] text-ink-faint">
          {gazette.evidence.slice(0, 4).map((e, i) => (
            <li key={i}>
              <span className="font-mono text-ink-soft">{e.source}</span> — {e.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-teal">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          {t('provenance.locally')}
        </p>
      </Section>
      </div>

      {/* right sidebar — odds / dark horse / trivia as standalone boxes
          (v0.5.0 step 5; collapses under the main column in print/mobile) */}
      <aside className="space-y-4 lg:col-span-4" aria-label={t('sidebarLabel')} data-testid="gazette-sidebar">
        {fav != null ? (
          <Section title={t('odds.title')} icon={<Trophy className="h-4 w-4" />} testId="gazette-odds-box">
            <div className="space-y-3">
              <OddsTable
                title={t('odds.teamTitle')}
                rows={fav.teams.map((row) => ({
                  id: row.id,
                  name: row.name,
                  sub: '',
                  odds: row.odds,
                  form: row.form,
                  avgPoints: row.avgPoints,
                  highlight: row.id === model.player.teamId,
                }))}
                colOdds={t('odds.colOdds')}
                colForm={t('odds.colForm')}
                colAvg={t('odds.colAvg')}
              />
              <OddsTable
                title={t('odds.driverTitle')}
                rows={fav.drivers.map((row) => ({
                  id: row.id,
                  name: row.name,
                  sub: row.teamName,
                  odds: row.odds,
                  form: row.form,
                  avgPoints: row.avgPoints,
                  highlight: row.teamName === model.player.teamName,
                }))}
                colOdds={t('odds.colOdds')}
                colForm={t('odds.colForm')}
                colAvg={t('odds.colAvg')}
              />
              <p className="text-[11px] text-ink-faint">
                {fav.basis === 'trackType'
                  ? t('odds.basisTrackType', { count: fav.sampleRaces })
                  : t('odds.basisSeason')}{' '}
                {t('odds.disclaimer')}
              </p>
            </div>
          </Section>
        ) : null}

        {issue.darkHorse != null ? (
          <Section title={t('odds.darkHorseTitle')} icon={<Trophy className="h-4 w-4" />} testId="gazette-darkhorse-box">
            <ul className="space-y-1 text-xs text-ink-soft" data-testid="gazette-darkhorse">
              {issue.darkHorse.team ? (
                <li>
                  {t('odds.darkHorseTeam', {
                    team: issue.darkHorse.team.teamName,
                    recent: issue.darkHorse.team.recentAvg.toFixed(1),
                    early: issue.darkHorse.team.earlyAvg.toFixed(1),
                  })}
                </li>
              ) : null}
              {issue.darkHorse.driver ? (
                <li>
                  {t('odds.darkHorseDriver', {
                    driver: issue.darkHorse.driver.driverName,
                    team: issue.darkHorse.driver.teamName,
                    recent: issue.darkHorse.driver.recentAvg.toFixed(1),
                  })}
                </li>
              ) : null}
            </ul>
          </Section>
        ) : null}

        {issue.trivia != null ? (
          <Section title={t('trivia.title')} icon={<BookOpen className="h-4 w-4" />} testId="gazette-trivia-box">
            <ul className="space-y-1 text-xs text-ink-soft">
              {issue.trivia.lastWinner ? (
                <li>
                  {t('trivia.lastWinner', {
                    driver: issue.trivia.lastWinner.driverName,
                    team: issue.trivia.lastWinner.teamName,
                  })}
                </li>
              ) : null}
              {issue.trivia.mostWins ? (
                <li>
                  {t('trivia.mostWins', {
                    driver: issue.trivia.mostWins.driverName,
                    wins: issue.trivia.mostWins.wins,
                  })}
                </li>
              ) : null}
              {issue.trivia.lapRecord ? (
                <li>
                  {issue.trivia.lapRecord.driverName
                    ? t('trivia.lapRecord', {
                        time: formatLapTime(issue.trivia.lapRecord.lapMs),
                        driver: issue.trivia.lapRecord.driverName,
                        year: issue.trivia.lapRecord.year ?? '—',
                      })
                    : t('trivia.lapRecordNoName', {
                        time: formatLapTime(issue.trivia.lapRecord.lapMs),
                        year: issue.trivia.lapRecord.year ?? '—',
                      })}
                </li>
              ) : null}
            </ul>
          </Section>
        ) : null}
      </aside>
      </div>
    </div>
  );
}

function AwardCard({ label, name, sub }: { label: string; name: string; sub: string }) {
  return (
    <div className="rounded border border-line/60 bg-surface px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-gold">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{name}</p>
      <p className="text-xs text-ink-soft">{sub}</p>
    </div>
  );
}

function QuoteBlock({ name, text }: { name: string; text: string }) {
  const t = useTranslations('gazette.quotes');
  return (
    <div className="mt-3 rounded border border-gold/20 bg-gold/5 px-3 py-2.5">
      <p className="text-sm italic text-ink">“{text}”</p>
      <p className="mt-1 font-mono text-[11px] text-ink-faint">{t('quoteFrom', { name })}</p>
    </div>
  );
}

function HighlightRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-start gap-2 rounded border border-line/60 bg-surface px-3 py-2">
      <span className="mt-0.5 text-gold" aria-hidden="true">{icon}</span>
      <span className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-wide text-ink-faint">{label}</span>
        <span className="block text-xs text-ink">{value}</span>
      </span>
    </li>
  );
}

interface OddsRow {
  id: number;
  name: string;
  sub: string;
  odds: number;
  form: string[];
  avgPoints: number;
  highlight: boolean;
}

function OddsTable({
  title,
  rows,
  colOdds,
  colForm,
  colAvg,
}: {
  title: string;
  rows: OddsRow[];
  colOdds: string;
  colForm: string;
  colAvg: string;
}) {
  return (
    <div className="min-w-0 overflow-x-auto rounded border border-line/60 bg-surface p-3" data-testid="gazette-odds">
      <p className="mb-2 text-xs font-semibold text-ink">{title}</p>
      <table className="w-full min-w-[260px] text-left text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
            <th className="px-1.5 py-1">#</th>
            <th className="px-1.5 py-1"> </th>
            <th className="px-1.5 py-1">{colForm}</th>
            <th className="px-1.5 py-1 text-right">{colAvg}</th>
            <th className="px-1.5 py-1 text-right">{colOdds}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className={cn('border-t border-line/50', row.highlight && 'bg-amber/5')}>
              <td className="px-1.5 py-1 font-mono text-ink-faint">{i + 1}</td>
              <td className="px-1.5 py-1">
                <span className="text-ink">{row.name}</span>
                {row.sub ? <span className="ml-1 text-ink-faint">{row.sub}</span> : null}
              </td>
              <td className="px-1.5 py-1">
                <span className="flex flex-wrap gap-0.5">
                  {row.form.map((f, j) => (
                    <span
                      key={j}
                      className={cn(
                        'rounded px-1 py-0.5 font-mono text-[9px]',
                        f === 'DNF' ? 'bg-danger/15 text-danger' : 'bg-raised text-ink-soft',
                      )}
                    >
                      {f}
                    </span>
                  ))}
                </span>
              </td>
              <td className="px-1.5 py-1 text-right font-mono text-ink-soft">{row.avgPoints.toFixed(1)}</td>
              <td className="px-1.5 py-1 text-right font-mono text-gold">{row.odds.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
