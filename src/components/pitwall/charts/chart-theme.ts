'use client';

/**
 * Chart theme + helpers — v0.5.0 Step 2.
 * Shared tokens for every Recharts surface: engine-derived data only,
 * token colours, ≤400 ms animation, prefers-reduced-motion respected.
 */

import { useReducedMotion } from 'framer-motion';

/* Colours mirror the CSS tokens in globals.css (kept literal for SVG). */
export const CHART_COLORS = {
  player: '#2ee6c8', // teal — CustomTeam
  playerStroke: '#8ff2e2',
  rival: '#ffb02e', // amber — rivalRef
  rivalStroke: '#ffd07a',
  bar: '#33475f', // xám xanh — other teams
  good: '#3ddc97',
  danger: '#ff5c6c',
  amber: '#ffb02e',
  info: '#4cc3ff',
  gold: '#ffc94d',
  axis: '#7d8fa3', // ink-faint (≥4.8:1)
  grid: '#223041', // line
  /* tyre compounds (same hexes as StintTimeline) */
  soft: '#c8102e',
  medium: '#e3b71e',
  hard: '#e9e5dc',
} as const;

/** Recharts animation: on unless the OS asks for reduced motion.
 *  In test runs (jsdom) animation is always off — Recharts only renders
 *  LabelList after the animation finishes and jsdom never advances rAF. */
export function useChartAnimation(): { isAnimationActive: boolean; animationDuration: number } {
  const reduced = useReducedMotion();
  const testEnv = process.env.NODE_ENV === 'test';
  return {
    isAnimationActive: !reduced && !testEnv,
    animationDuration: 400,
  };
}

export const TICK_STYLE = {
  fill: CHART_COLORS.axis,
  fontSize: 11,
  fontFamily: 'var(--font-jetbrains-mono), monospace',
} as const;

export const LABEL_STYLE = {
  fill: '#92a3b7',
  fontSize: 10,
  fontFamily: 'var(--font-jetbrains-mono), monospace',
} as const;
