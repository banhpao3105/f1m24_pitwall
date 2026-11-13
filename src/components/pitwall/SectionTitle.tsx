'use client';

/**
 * Section title — v0.5.0 Step 4 typography hierarchy (prompt §2 Bước 4):
 * every section in every view reads the same: mono 11px teal uppercase
 * kicker + 15px semibold title + optional right-side affordances.
 */

import { cn } from '@/lib/utils';

export function SectionTitle({
  kicker,
  title,
  right,
  className,
  id,
}: {
  /** Small overline label (mono, teal, uppercase). */
  kicker: string;
  /** The real section heading. */
  title: string;
  /** Right-aligned extras (badges, buttons). */
  right?: React.ReactNode;
  className?: string;
  /** Heading id for aria-labelledby wiring. */
  id?: string;
}) {
  return (
    <header className={cn('mb-3 flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span aria-hidden="true" className="font-mono text-[11px] uppercase tracking-wider text-teal">
        {kicker}
      </span>
      <h3 id={id} className="text-[15px] font-semibold leading-snug text-ink">
        {title}
      </h3>
      {right ? <span className="ml-auto flex items-center gap-2">{right}</span> : null}
    </header>
  );
}
