'use client';

/**
 * TrackSchematic — v0.5.0 Step 3 (prompt §2 Bước 3).
 * Simple SVG outlines for the 26 tracks of track-display.ts. These are
 * schematic approximations of each circuit's silhouette — explicitly
 * labelled "schematic, not to scale" — no DRS zones, no sectors, no
 * lengths beyond what the model already carries.
 *
 * Convention: every path starts with a short straight leading segment
 * (`M x1 y1 L x2 y2 …`); the start-line tick + direction chevron are
 * derived from those two points, so direction is data, not hand-placed.
 */

import { useTranslations } from 'next-intl';

/** Simplified outline per Races_Tracks.Name key (100×100 viewbox). */
const TRACK_PATHS: Record<string, string> = {
  AlbertPark: 'M20 74 L28 82 C40 90 62 90 72 82 C84 72 86 56 80 44 C76 34 66 30 56 34 C46 38 42 30 32 30 C20 30 12 40 12 52 C12 62 14 70 20 74 Z',
  Bahrain: 'M14 30 L52 22 C68 20 84 26 86 40 C88 54 78 64 62 66 L34 70 C22 72 12 64 12 50 C12 42 12 34 14 30 Z',
  Shanghai: 'M18 62 L40 58 C52 56 54 44 46 40 C40 37 30 40 28 32 C26 24 36 18 48 20 C64 22 76 30 82 44 C86 54 78 62 66 64 L30 72 C22 74 14 70 18 62 Z',
  Baku: 'M16 70 L16 36 C16 28 24 24 32 26 L70 32 C80 34 86 42 84 52 L80 62 C78 70 70 74 62 72 L24 78 C18 78 16 75 16 70 Z',
  Barcelona: 'M22 32 L60 24 C74 22 86 30 84 44 C82 56 72 60 60 58 L48 56 C40 55 36 60 40 66 C44 72 54 74 62 72 L74 70 C80 74 76 82 66 84 L34 86 C22 86 14 78 16 66 L18 46 C19 40 20 35 22 32 Z',
  Monaco: 'M30 22 L58 18 C66 17 72 22 70 28 L64 40 C62 46 66 50 72 48 L80 46 C86 48 86 56 80 60 L58 74 C50 79 40 80 34 74 L22 62 C16 56 18 48 24 44 L34 38 C40 34 38 26 30 22 Z',
  Montreal: 'M20 40 L36 32 C44 28 52 32 50 40 L48 48 C47 54 52 58 58 56 L70 52 C78 50 84 56 80 64 L70 76 C62 84 48 84 40 76 L24 60 C16 52 14 44 20 40 Z',
  PaulRicard: 'M18 36 L54 26 C68 22 84 28 84 42 C84 54 74 60 62 58 L52 56 C46 55 44 60 48 64 L58 72 C62 78 58 84 50 84 L30 82 C20 80 14 72 16 62 L18 48 C19 43 18 39 18 36 Z',
  RedBullRing: 'M28 26 L64 22 C76 21 84 28 82 38 L78 52 C76 60 68 64 60 62 L52 60 C46 59 44 64 48 68 L58 76 C62 82 56 88 48 86 L30 80 C22 77 18 70 20 62 L24 40 C25 34 25 29 28 26 Z',
  Silverstone: 'M24 34 L46 26 C54 23 60 28 58 34 L56 40 C55 45 60 48 66 46 L74 43 C82 42 86 48 82 55 L74 68 C68 77 56 80 48 74 L40 68 C36 65 30 66 28 60 L22 46 C19 40 19 36 24 34 Z',
  Jeddah: 'M16 60 L20 34 C22 26 30 22 38 26 L52 33 C60 37 68 33 74 27 C80 22 88 26 86 34 L82 48 C80 56 72 60 64 58 L54 55 C48 54 46 58 50 62 L62 72 C66 78 62 84 54 82 L28 74 C19 71 14 67 16 60 Z',
  Hungaroring: 'M24 32 L58 24 C70 22 82 28 82 40 C82 50 74 55 64 54 L56 53 C50 52 48 57 52 61 L62 69 C66 75 60 81 52 79 L30 72 C22 69 18 62 20 54 L23 44 C24 39 22 35 24 32 Z',
  SpaFrancorchamps: 'M20 66 L30 44 C34 36 30 30 36 24 C42 18 52 20 54 28 L56 36 C57 42 64 44 70 40 L76 36 C83 33 88 40 84 47 L76 60 C72 68 62 72 54 68 L46 64 C40 61 36 66 38 72 L40 78 C41 84 34 87 29 82 L18 72 C15 69 18 68 20 66 Z',
  Monza: 'M16 32 L64 24 C76 22 86 28 84 38 L82 48 C81 54 74 56 70 52 L64 46 C60 42 54 44 54 50 L54 62 C54 70 46 74 40 70 L34 66 C30 63 26 65 27 70 L29 78 C30 84 23 87 19 82 L13 72 C10 67 11 60 13 54 L16 42 C17 38 15 35 16 32 Z',
  MarinaBay: 'M18 46 L22 32 C24 25 32 22 38 26 L44 30 C49 33 55 30 56 24 L57 20 C58 14 66 13 70 18 L80 30 C84 35 82 42 76 44 L68 47 C62 49 62 55 68 57 L74 59 C80 62 80 70 74 73 L56 80 C48 83 40 80 38 72 L34 58 C33 53 28 50 24 53 C20 56 17 52 18 46 Z',
  Sochi: 'M22 40 L48 30 C56 27 64 31 63 39 L62 46 C61 52 66 56 72 54 L78 52 C85 51 88 58 83 63 L70 75 C62 82 50 82 44 74 L38 66 C35 62 30 62 28 56 L22 48 C20 44 19 42 22 40 Z',
  Suzuka: 'M18 70 L14 50 C12 40 20 32 30 34 L44 38 C52 40 56 34 52 28 L48 22 C45 15 52 9 59 13 L74 22 C82 27 84 37 78 44 L70 52 C65 57 67 64 74 64 L80 64 C87 65 89 73 83 77 L64 88 C55 93 44 91 40 83 L36 75 C33 69 26 67 22 72 Z',
  HermanosRodriguez: 'M20 34 L52 24 C64 21 76 26 76 38 L76 50 C76 56 82 58 86 54 C90 51 94 56 91 61 L82 74 C76 82 64 84 56 78 L48 71 C44 68 39 70 39 75 L39 80 C38 86 30 87 27 81 L17 60 C14 53 15 40 20 34 Z',
  CircuitOfTheAmericas: 'M22 62 L18 44 C16 36 22 28 30 28 L44 29 C52 30 54 24 60 22 L70 19 C78 17 84 23 82 31 L79 42 C78 48 82 52 88 51 C93 50 94 57 90 61 L78 72 C70 79 58 80 50 74 L44 69 C40 66 35 68 35 73 L35 78 C34 84 27 85 24 79 L21 70 Z',
  Interlagos: 'M26 30 L58 22 C70 19 82 26 80 38 L78 48 C77 54 70 56 66 52 L60 46 C56 42 50 44 50 50 L50 62 C50 70 42 74 36 70 L30 66 C26 63 21 65 22 70 L24 76 C25 82 18 84 15 78 L11 66 C9 59 12 52 18 48 L23 44 C27 41 26 35 26 30 Z',
  YasMarina: 'M18 44 L24 30 C27 23 35 20 42 24 L48 28 C53 31 59 28 60 22 L61 18 C62 12 70 11 74 16 L82 27 C86 33 83 40 76 41 L68 42 C62 43 61 49 66 52 L74 56 C80 60 79 68 72 71 L54 78 C46 81 38 78 36 70 L33 58 C32 53 27 51 23 54 C19 57 16 50 18 44 Z',
  Miami: 'M16 38 L40 28 C46 25 52 28 52 34 L52 40 C52 46 58 48 63 45 L70 40 C76 36 84 40 83 47 L82 56 C81 63 74 67 68 64 L62 61 C57 59 53 62 54 67 L55 74 C55 80 49 84 43 81 L24 72 C15 68 12 60 14 52 Z',
  Zandvoort: 'M26 34 L52 26 C62 23 72 28 74 38 C75 46 68 50 60 48 L54 46 C48 45 46 50 50 54 L60 63 C65 69 60 77 52 76 L32 72 C24 70 18 63 20 55 L23 43 C24 39 23 37 26 34 Z',
  Imola: 'M20 44 L28 32 C32 26 40 25 45 30 L50 35 C54 39 60 37 61 31 L62 26 C63 20 70 18 74 23 L82 33 C86 39 83 46 76 47 L68 48 C62 49 61 55 66 58 L72 61 C78 65 76 73 69 75 L48 81 C40 83 33 79 32 71 L30 58 C29 53 25 51 22 54 C18 57 17 50 20 44 Z',
  Vegas: 'M14 66 L18 40 C19 32 27 28 34 32 L46 39 C51 42 57 39 58 33 L59 27 C60 20 68 18 72 24 L82 39 C85 45 82 52 75 52 L66 52 C60 52 58 58 62 62 L70 70 C74 76 70 83 63 81 L26 72 C18 70 13 69 14 66 Z',
  Qatar: 'M24 30 L62 24 C74 22 84 29 82 41 L80 52 C78 60 70 64 62 61 L54 58 C48 56 44 60 47 65 L53 73 C56 79 51 84 44 82 L28 76 C20 73 16 65 18 57 L22 40 C23 35 22 33 24 30 Z',
};

/** Generic fallback loop for unknown keys (still labelled as schematic). */
const FALLBACK_PATH =
  'M20 74 L24 82 C40 90 60 90 76 82 C86 74 86 58 78 46 C70 34 56 28 44 32 C32 36 22 44 20 56 Z';

interface Pt {
  x: number;
  y: number;
}

function leadingSegment(d: string): { from: Pt; to: Pt } | null {
  const m = /^M\s*([\d.]+)[,\s]+([\d.]+)\s+L\s*([\d.]+)[,\s]+([\d.]+)/.exec(d);
  if (!m) return null;
  return {
    from: { x: Number(m[1]), y: Number(m[2]) },
    to: { x: Number(m[3]), y: Number(m[4]) },
  };
}

export function TrackSchematic({
  trackName,
  className,
}: {
  /** Raw Races_Tracks.Name key ("AlbertPark", "Suzuka", …). */
  trackName: string;
  className?: string;
}) {
  const t = useTranslations('race.schematic');
  const d = TRACK_PATHS[trackName] ?? FALLBACK_PATH;
  const seg = leadingSegment(d);
  const angle = seg ? (Math.atan2(seg.to.y - seg.from.y, seg.to.x - seg.from.x) * 180) / Math.PI : 0;
  const start = seg?.from ?? { x: 20, y: 74 };
  const known = TRACK_PATHS[trackName] != null;

  return (
    <figure className={className} data-testid="track-schematic">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={t('label')}
        className="h-full w-full"
      >
        {/* circuit outline */}
        <path
          d={d}
          fill="none"
          stroke="#2f4056"
          strokeWidth={6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={d}
          fill="none"
          stroke="#3f5470"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* start line — 10-unit tick across the track at the segment origin */}
        {seg ? (
          <line
            x1={start.x - 5}
            y1={start.y}
            x2={start.x + 5}
            y2={start.y}
            stroke="#e6edf3"
            strokeWidth={2.5}
            strokeLinecap="round"
            transform={`rotate(${angle + 90} ${start.x} ${start.y})`}
          />
        ) : null}
        {/* direction chevron on the leading segment */}
        {seg ? (
          <polygon
            points="-3,-4 3,0 -3,4"
            fill="#2ee6c8"
            transform={`translate(${(start.x + seg.to.x) / 2}, ${(start.y + seg.to.y) / 2}) rotate(${angle})`}
          />
        ) : null}
      </svg>
      <figcaption className="mt-1 text-center font-mono text-[9px] uppercase tracking-wide text-ink-faint">
        {known ? t('label') : t('generic')}
      </figcaption>
    </figure>
  );
}
