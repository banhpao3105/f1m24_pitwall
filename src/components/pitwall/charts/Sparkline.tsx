'use client';

/**
 * Sparkline — v0.6.0 step 5 (prompt §5): tiny inline SVG polyline for
 * per-race numbers (driver points, etc.). Pure SVG, no chart lib, no
 * invented scaling — y maps 0..max of the given values; nulls break the line.
 */

export function Sparkline({
  values,
  width = 96,
  height = 22,
  stroke = 'var(--color-teal, #2ee6c8)',
  testId,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  stroke?: string;
  testId?: string;
}) {
  const finite = values.filter((v): v is number => v != null);
  if (finite.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }
  const max = Math.max(...finite, 0);
  const min = Math.min(...finite, 0);
  const span = max - min || 1;
  const n = values.length;
  const x = (i: number): number => (n <= 1 ? width / 2 : 2 + (i * (width - 4)) / (n - 1));
  const y = (v: number): number => height - 2 - ((v - min) / span) * (height - 4);

  /* build polyline segments, breaking at nulls */
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (current.length > 0) segments.push(current.join(' '));
      current = [];
    } else {
      current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    }
  });
  if (current.length > 0) segments.push(current.join(' '));

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={values.map((v) => (v == null ? '—' : String(v))).join(', ')}
      data-testid={testId ?? 'sparkline'}
      className="inline-block align-middle"
    >
      {segments.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {/* dot on the last finite point */}
      {(() => {
        let lastIdx = -1;
        values.forEach((v, i) => {
          if (v != null) lastIdx = i;
        });
        const last = lastIdx >= 0 ? values[lastIdx] : null;
        if (last == null || lastIdx < 0) return null;
        return <circle cx={x(lastIdx)} cy={y(last)} r={1.8} fill={stroke} />;
      })()}
    </svg>
  );
}
