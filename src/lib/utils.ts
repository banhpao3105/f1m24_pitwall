import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 0.5.3 — the app's compact money format, shared by the Strategy snapshot
 * and engine recommendation titles so both views render the same string for
 * the same number. Pure function (engines import it). v0.6.0: millions carry
 * two decimals ("4.28M") per the dashboard-first prompt's number format.
 */
export function formatMoneyCompact(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${value < 0 ? '-' : ''}${(abs / 1_000).toFixed(0)}K`;
  return String(value);
}

/**
 * v0.6.0 — the app's unified seconds format (3 decimals, prompt §1:
 * "giây 3 chữ số thập phân"). Sign is kept for gaps where callers want it;
 * callers format signed prefixes explicitly with formatSigned when needed.
 */
export function formatSec(value: number | null | undefined, digits = 3): string {
  if (value == null) return '—';
  return value.toFixed(digits);
}

/** v0.6.0 — signed number ("+81" / "−4") for positions-gained surfaces. */
export function formatSigned(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value >= 0 ? '+' : ''}${value}`;
}
