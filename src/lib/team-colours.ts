/**
 * Team colour helpers — v0.5.0 Step 3 (team identity, prompt §2 Bước 3).
 * Source of truth: `Team.colourPrimary` from Teams_Colours (parser). When a
 * save lacks the table (or a team has no row) every helper falls back to a
 * neutral slate so nothing looks invented — colours are identity, not data.
 */

import type { SaveModel } from '@/domain/types';

/** Neutral fallback matching --color-line-strong (#2f4056 family). */
export const FALLBACK_TEAM_COLOUR = '#46586e';

/** Luminance-based readable text colour for a hex background. */
export function readableTextOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#070b11';
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  // YIQ contrast rule (broadcast standard) — dark text on light liveries.
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#070b11' : '#f2f7fb';
}

/** Real livery colour for a team, or the neutral fallback. */
export function teamColour(model: SaveModel, teamId: number | undefined | null): string {
  if (teamId == null) return FALLBACK_TEAM_COLOUR;
  const team = model.teams.find((t) => t.teamId === teamId);
  return team?.colourPrimary ?? FALLBACK_TEAM_COLOUR;
}

/** Colour + text pair for a team — single lookup for dots/avatars/bars. */
export function teamPair(
  model: SaveModel,
  teamId: number | undefined | null,
): { bg: string; fg: string } {
  const bg = teamColour(model, teamId);
  return { bg, fg: readableTextOn(bg) };
}
