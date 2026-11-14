import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 0.5.3 — the app's compact money format ("4.3M", "850K"), shared by the
 * Strategy snapshot and engine recommendation titles so both views render
 * the same string for the same number. Pure function (engines import it).
 */
export function formatMoneyCompact(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${value < 0 ? '-' : ''}${(abs / 1_000).toFixed(0)}K`;
  return String(value);
}
