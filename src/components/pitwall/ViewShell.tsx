'use client';

/**
 * ViewShell — v0.5.0 Step 4 (prompt §2 Bước 4: "skeleton loading khi đổi
 * view — không để trắng trang"). A short (~180 ms) skeleton appears when
 * the wall view key changes, then the real view fades in. Purely
 * presentational: engines are memoized upstream, nothing recomputes.
 * Skipped entirely under prefers-reduced-motion (instant swap).
 */

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-raised ${className ?? ''}`} aria-hidden="true" />;
}

function ViewSkeleton() {
  const t = useTranslations('common');
  return (
    <div role="status" aria-live="polite" aria-label={t('loading')} data-testid="view-skeleton">
      <span className="sr-only">{t('loading')}</span>
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-panel p-4">
          <SkeletonPulse className="h-4 w-44" />
          <SkeletonPulse className="mt-3 h-3 w-72" />
          <SkeletonPulse className="mt-2 h-3 w-60" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-lg border border-line bg-panel p-4 lg:col-span-7">
            <SkeletonPulse className="h-24 w-full" />
          </div>
          <div className="rounded-lg border border-line bg-panel p-4 lg:col-span-5">
            <SkeletonPulse className="h-24 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ViewShell({ viewKey, children }: { viewKey: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [prevKey, setPrevKey] = useState(viewKey);
  const [showSkeleton, setShowSkeleton] = useState(false);

  // Render-phase derived-state pattern (react.dev): on view change, flip
  // into the skeleton state synchronously — no setState-in-effect.
  if (viewKey !== prevKey) {
    setPrevKey(viewKey);
    setShowSkeleton(!reduced);
  }

  useEffect(() => {
    if (!showSkeleton) return;
    // Hide after a beat — async callback, allowed inside effects.
    const timer = window.setTimeout(() => setShowSkeleton(false), 180);
    return () => window.clearTimeout(timer);
  }, [showSkeleton]);

  if (showSkeleton) return <ViewSkeleton />;
  return <>{children}</>;
}
