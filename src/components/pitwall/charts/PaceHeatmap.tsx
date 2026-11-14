'use client';

/**
 * PaceHeatmap — v0.6.0 step 3 (prompt §3): the ONLY canvas surface in the
 * app. 11 teams × 6 races grid coloured by the RACE pace gap of each race
 * (green = fast, red = slow); the player's row is highlighted. Pure
 * <canvas> with devicePixelRatio scaling — no chart library can do this
 * grid density cleanly in Recharts.
 *
 * Data: series.paceGapPerTeam.race — values verbatim from the race-pace
 * board's raceDeltasS (no recomputation). Hover shows team · race · gap.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import type { SeasonSeries } from '@/engines/dashboard.engine';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { CHART_COLORS } from './chart-theme';

/* green → amber → red, matching the app's good/amber/danger tokens */
const STOP_FAST = [0x3d, 0xdc, 0x97]; // #3ddc97
const STOP_MID = [0xff, 0xb0, 0x2e]; // #ffb02e
const STOP_SLOW = [0xff, 0x5c, 0x6c]; // #ff5c6c

function gapColour(t: number): string {
  const lerp = (a: number[], b: number[], k: number): number[] =>
    a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const rgb = t <= 0.5 ? lerp(STOP_FAST, STOP_MID, t * 2) : lerp(STOP_MID, STOP_SLOW, (t - 0.5) * 2);
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

const GUTTER_LEFT = 128;
const GUTTER_TOP = 22;
const ROW_H = 26;
const NULL_CELL = '#18222f';

export function PaceHeatmap({
  series,
  model,
  testId,
}: {
  series: SeasonSeries;
  model: SaveModel;
  testId?: string;
}) {
  const locale = useLocale() as 'vi' | 'en';
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssSize, setCssSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ row: number; col: number; x: number; y: number } | null>(null);

  const rows = series.paceGapPerTeam.race;
  const races = series.races;
  const nRows = rows.length;
  const nCols = races.length;
  const height = GUTTER_TOP + nRows * ROW_H + 4;

  /* track the wrapper width (responsive) */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setCssSize({ w: el.clientWidth, h: height });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  /* max gap across the grid for the colour scale */
  let maxGap = 0;
  for (const row of rows) {
    for (const v of row.values) {
      if (v != null && v > maxGap) maxGap = v;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssSize.w <= 0 || nRows === 0 || nCols === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cssSize.w;
    const h = height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cellW = (w - GUTTER_LEFT - 8) / nCols;

    /* column headers (track names, truncated) */
    ctx.font = '10px var(--font-jetbrains-mono), monospace';
    ctx.fillStyle = CHART_COLORS.axis;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    races.forEach((race, c) => {
      const label = trackDisplay(race.trackName, locale);
      const clipped = label.length > 10 ? `${label.slice(0, 9)}…` : label;
      ctx.fillText(clipped, GUTTER_LEFT + c * cellW + 4, GUTTER_TOP / 2 + 1);
    });

    /* rows */
    rows.forEach((row, r) => {
      const y = GUTTER_TOP + r * ROW_H;
      /* team name gutter */
      ctx.fillStyle = row.isPlayer ? CHART_COLORS.player : CHART_COLORS.axis;
      ctx.font = row.isPlayer
        ? 'bold 11px var(--font-jetbrains-mono), monospace'
        : '11px var(--font-jetbrains-mono), monospace';
      const name = row.teamName.length > 17 ? `${row.teamName.slice(0, 16)}…` : row.teamName;
      ctx.fillText(name, 4, y + ROW_H / 2);

      /* cells */
      row.values.forEach((v, c) => {
        const x = GUTTER_LEFT + c * cellW;
        if (v == null) {
          ctx.fillStyle = NULL_CELL;
        } else {
          ctx.fillStyle = gapColour(maxGap > 0 ? Math.min(1, v / maxGap) : 0);
        }
        ctx.fillRect(x + 1, y + 1, cellW - 2, ROW_H - 2);
        /* gap value in the cell when it fits */
        if (cellW >= 58 && v != null) {
          ctx.fillStyle = 'rgba(7,11,17,0.85)';
          ctx.font = '10px var(--font-jetbrains-mono), monospace';
          ctx.fillText(`+${v.toFixed(2)}`, x + 5, y + ROW_H / 2);
        }
      });

      /* player row highlight */
      if (row.isPlayer) {
        ctx.strokeStyle = CHART_COLORS.player;
        ctx.lineWidth = 2;
        ctx.strokeRect(1.5, y + 0.5, w - 3, ROW_H - 1);
      }
    });
  }, [cssSize, rows, races, maxGap, nRows, nCols, height, locale]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellW = (cssSize.w - GUTTER_LEFT - 8) / Math.max(1, nCols);
    const col = Math.floor((x - GUTTER_LEFT) / cellW);
    const row = Math.floor((y - GUTTER_TOP) / ROW_H);
    if (col < 0 || col >= nCols || row < 0 || row >= nRows) {
      setHover(null);
      return;
    }
    setHover({ row, col, x, y });
  };

  if (nRows === 0 || nCols === 0) {
    return (
      <p className="text-xs text-ink-faint" data-testid={testId ?? 'pace-heatmap'}>
        —
      </p>
    );
  }

  const hoverRow = hover ? rows[hover.row] : null;
  const hoverValue = hover && hoverRow ? hoverRow.values[hover.col] : null;
  const hoverRace = hover ? races[hover.col] : null;

  return (
    <div ref={wrapRef} className="relative w-full" data-testid={testId ?? 'pace-heatmap'}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Heatmap pace đua ${nRows} đội × ${nCols} chặng — xanh lá nhanh, đỏ chậm; hàng đội bạn được khoanh nổi`}
        className="block w-full cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      />
      {hover && hoverRow && hoverRace ? (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(0, hover.x + 12), Math.max(0, cssSize.w - 190)),
            top: Math.max(0, hover.y - 54),
          }}
          data-testid="pace-heatmap-tooltip"
        >
          <p className="font-medium text-ink">{hoverRow.teamName}</p>
          <p className="font-mono text-[11px] text-ink-soft">
            {trackDisplay(hoverRace.trackName, locale)}:{' '}
            <span className={hoverValue == null ? 'text-ink-faint' : 'tabular-nums text-ink'}>
              {hoverValue != null ? `+${hoverValue.toFixed(3)}s` : '—'}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
