'use client';

/**
 * ConfidenceBadge — HIGH/MEDIUM/LOW with icon + text + tooltip explaining
 * the source semantics (docs/04 §6.5: badge luôn có text + icon, không
 * chỉ dùng màu để truyền nghĩa).
 *   HIGH   = đo trực tiếp từ save
 *   MEDIUM = suy ra từ dữ liệu lịch sử trong save
 *   LOW    = hằng số mô hình (save thiếu dữ liệu)
 */

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Confidence } from '@/domain/provenance';

const CONFIG: Record<
  Confidence,
  { icon: React.ReactNode; className: string }
> = {
  HIGH: { icon: <ShieldCheck className="h-3 w-3" />, className: 'border-good/40 bg-good/10 text-good' },
  MEDIUM: { icon: <ShieldAlert className="h-3 w-3" />, className: 'border-amber/40 bg-amber/10 text-amber' },
  LOW: { icon: <ShieldQuestion className="h-3 w-3" />, className: 'border-line-strong bg-raised text-ink-soft' },
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const t = useTranslations('confidence');
  const cfg = CONFIG[confidence];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn('cursor-help gap-1 font-mono text-[10px] uppercase tracking-wide', cfg.className)}
            data-testid={`confidence-${confidence.toLowerCase()}`}
          >
            {cfg.icon}
            {confidence}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 text-xs">
          <p className="font-medium">{t(confidence)}</p>
          <p className="text-ink-soft">{t('semantics')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
