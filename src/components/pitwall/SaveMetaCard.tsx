'use client';

/**
 * Save metadata card — Phase 0 Definition of Done:
 * "Nạp save F1M 24 thật, thấy được team/season/day, không crash khi thiếu
 * bảng optional" (docs/05-ROADMAP-STANDARDS.md, Phase 0).
 */

import { useTranslations } from 'next-intl';
import type { SaveModel } from '@/domain/types';
import { Badge } from '@/components/ui/badge';
import {
  Flag,
  CalendarDays,
  Database,
  Cpu,
  Users,
  Hash,
  Info,
} from 'lucide-react';

interface SaveMetaCardProps {
  model: SaveModel;
}

export function SaveMetaCard({ model }: SaveMetaCardProps) {
  const t = useTranslations('meta');
  const meta = model.meta;

  const completed = model.races.filter((r) => r.state === 2).length;
  const parsedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(meta.parsedAt));

  return (
    <section
      aria-label={t('title')}
      className="mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-line bg-panel"
    >      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-teal">
          {t('title')}
        </h2>
        <Badge
          variant="outline"
          className="border-line-strong bg-raised font-mono text-[11px] text-ink-soft"
        >
          {meta.gameVersion}
        </Badge>
        {model.player.customTeamEnabled ? (
          <Badge
            variant="outline"
            className="border-amber/40 bg-amber/10 text-[11px] text-amber"
          >
            {t('customTeam')}
          </Badge>
        ) : null}
        <span className="ml-auto font-mono text-[11px] text-ink-faint">
          {formatMb(meta.fileSizeBytes)} · {meta.fileName}
        </span>
      </header>

      <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
        <MetaCell icon={<Users className="h-4 w-4" />} label={t('team')}>
          {model.player.teamName}
        </MetaCell>
        <MetaCell icon={<Cpu className="h-4 w-4" />} label={t('manager')}>
          {model.player.managerName ?? '—'}
        </MetaCell>
        <MetaCell icon={<CalendarDays className="h-4 w-4" />} label={t('season')}>
          <span className="font-mono">{meta.seasonId}</span>
        </MetaCell>
        <MetaCell icon={<CalendarDays className="h-4 w-4" />} label={t('day')}>
          <span className="font-mono">{meta.day.toLocaleString()}</span>
        </MetaCell>
        <MetaCell icon={<Flag className="h-4 w-4" />} label={t('racesCompleted')}>
          <span className="font-mono">
            {completed}/{model.races.length}
          </span>
        </MetaCell>
        <MetaCell icon={<Database className="h-4 w-4" />} label={t('tables')}>
          <span className="font-mono">{meta.tablesPresent.length}</span>
          {meta.tablesMissing.length > 0 ? (
            <span className="ml-1 font-mono text-amber">
              −{meta.tablesMissing.length}
            </span>
          ) : null}
        </MetaCell>
        <MetaCell icon={<Cpu className="h-4 w-4" />} label={t('build')}>
          <span className="font-mono text-[11px]">
            {meta.gameVersionWithBuild ?? meta.saveGameVersion}
          </span>
        </MetaCell>
        <MetaCell icon={<Hash className="h-4 w-4" />} label={t('saveId')}>
          <span className="block max-w-[24ch] truncate font-mono text-[11px]" title={meta.id}>
            {meta.id.slice(0, 16)}…
          </span>
        </MetaCell>
        <MetaCell icon={<Info className="h-4 w-4" />} label={t('parsedAt')}>
          <span className="font-mono text-[11px]">{parsedAt}</span>
        </MetaCell>
      </dl>

      {meta.warnings.length > 0 || meta.tablesMissing.length > 0 ? (
        <footer className="space-y-1.5 border-t border-line bg-surface px-4 py-3">
          {meta.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-xs text-amber">
              <span
                aria-hidden="true"
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
              />
              <span>
                {KNOWN_WARNINGS.includes(w)
                  ? t(`warnings.${w}` as Parameters<typeof t>[0])
                  : w}
              </span>
            </p>
          ))}
          {meta.tablesMissing.length > 0 ? (
            <p className="text-xs text-ink-soft">
              {t('missingTables', { tables: meta.tablesMissing.join(', ') })}
            </p>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KNOWN_WARNINGS = ['NO_COMPLETED_RACES'];

function MetaCell({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-panel px-4 py-3">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
        <span className="text-ink-faint" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm text-ink" title={typeof children === 'string' ? children : undefined}>
        {children}
      </dd>
    </div>
  );
}
