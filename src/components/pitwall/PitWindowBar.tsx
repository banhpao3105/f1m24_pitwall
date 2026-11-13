'use client';

/**
 * PitWindowBar — optimal / early / late windows around the recommended pit
 * lap (docs/04 §6.5). Pure presentational, keyboard-readable.
 */

export function PitWindowBar({
  optimalLap,
  windowLo,
  windowHi,
  totalLaps,
  lifeCap,
}: {
  optimalLap: number;
  windowLo: number;
  windowHi: number;
  totalLaps: number;
  /** Tyre life ceiling of the outgoing compound. */
  lifeCap?: number;
}) {
  const pct = (lap: number) => Math.max(0, Math.min(100, (lap / totalLaps) * 100));
  const cap = lifeCap ?? totalLaps;
  return (
    <div data-testid="pit-window-bar" className="space-y-1.5">
      <div className="relative h-3 w-full overflow-hidden rounded-full border border-line bg-raised">
        {/* early window */}
        <div
          className="absolute inset-y-0 bg-amber/25"
          style={{ left: `${pct(Math.max(1, windowLo - 2))}%`, width: `${pct(windowLo) - pct(Math.max(1, windowLo - 2))}%` }}
          title="Pit sớm"
        />
        {/* optimal window */}
        <div
          className="absolute inset-y-0 bg-teal/40"
          style={{ left: `${pct(windowLo)}%`, width: `${pct(windowHi + 1) - pct(windowLo)}%` }}
          title="Cửa sổ pit tối ưu"
        />
        {/* late window (up to life cap) */}
        <div
          className="absolute inset-y-0 bg-danger/25"
          style={{ left: `${pct(windowHi + 1)}%`, width: `${pct(Math.min(cap + 1, totalLaps)) - pct(windowHi + 1)}%` }}
          title="Pit muộn — vượt đời lốp là rủi ro"
        />
        {/* optimal lap marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-teal"
          style={{ left: `${pct(optimalLap)}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-ink-faint">
        <span>1</span>
        <span className="text-teal">
          Tối ưu: vòng {optimalLap} (cửa sổ {windowLo}–{windowHi})
        </span>
        <span>{totalLaps}</span>
      </div>
      {lifeCap != null ? (
        <p className="font-mono text-[10px] text-ink-faint">
          Trần đời lốp: vòng {lifeCap} — vượt trần là kế hoạch không thực thi được
        </p>
      ) : null}
    </div>
  );
}
