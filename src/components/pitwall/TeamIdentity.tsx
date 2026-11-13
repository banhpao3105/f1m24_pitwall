'use client';

/**
 * Team identity atoms — v0.5.0 Step 3 (prompt §2 Bước 3).
 * TeamDot: small livery-coloured circle shown before team names in every
 * standings/list. DriverAvatar: initials disc on the team colour.
 * Pure presentation; colour comes from Teams_Colours via team-colours.ts.
 */

import type { SaveModel } from '@/domain/types';
import { teamPair } from '@/lib/team-colours';
import { cn } from '@/lib/utils';

export function TeamDot({
  model,
  teamId,
  className,
}: {
  model: SaveModel;
  teamId?: number | null;
  className?: string;
}) {
  const { bg } = teamPair(model, teamId);
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/20', className)}
      style={{ backgroundColor: bg }}
    />
  );
}

export function DriverAvatar({
  model,
  teamId,
  name,
  className,
}: {
  model: SaveModel;
  teamId?: number | null;
  /** Full driver name — initials are derived, never stored. */
  name: string;
  className?: string;
}) {
  const { bg, fg } = teamPair(model, teamId);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold',
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
    >
      {initials || '—'}
    </span>
  );
}
