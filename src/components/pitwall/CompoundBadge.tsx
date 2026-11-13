'use client';

/**
 * CompoundBadge — F1 tyre compound chip: colour dot + letter + label text
 * (docs/04 §6.5: badge never colour-only). Colours follow F1 convention
 * from the oracle: S #c8102e, M #e3b71e, H #e9e5dc, I green, W blue.
 */

import { cn } from '@/lib/utils';

export type CompoundKey = 'S' | 'M' | 'H' | 'I' | 'W';

const DOT: Record<CompoundKey, string> = {
  S: 'bg-[#c8102e]',
  M: 'bg-[#e3b71e]',
  H: 'bg-[#e9e5dc]',
  I: 'bg-[#2fa84f]',
  W: 'bg-[#1d5f8a]',
};

const LABEL: Record<CompoundKey, string> = {
  S: 'Soft',
  M: 'Medium',
  H: 'Hard',
  I: 'Intermediate',
  W: 'Wet',
};

export function CompoundBadge({
  compound,
  size = 'md',
  showLabel = false,
}: {
  compound: CompoundKey;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-line-strong bg-raised font-mono font-bold',
        size === 'sm' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs',
      )}
      title={`${LABEL[compound]} tyre`}
    >
      <span
        aria-hidden="true"
        className={cn('rounded-full', DOT[compound], size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5')}
      />
      {compound}
      {showLabel ? (
        <span className="font-sans font-normal text-ink-soft">{LABEL[compound]}</span>
      ) : null}
    </span>
  );
}
