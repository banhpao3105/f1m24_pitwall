'use client';

/**
 * NumberTween — Phase 3 motion polish (docs/06 §6.4 "number tween").
 *
 * Tweens a numeric KPI when its value changes (filter/save switch only —
 * never continuously), honoring `prefers-reduced-motion` (docs/06 §6.4:
 * "Tắt khi prefers-reduced-motion"): with reduced motion the new value
 * renders immediately, no spring.
 *
 * Pure display component — engines never animate.
 */

import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useTransform, motion, useReducedMotion } from 'framer-motion';

export interface NumberTweenProps {
  value: number;
  /** Render the (possibly fractional) animated number. */
  format?: (n: number) => string;
  className?: string;
  /** Spring stiffness/damping — defaults tuned for < 300 ms settle. */
  stiffness?: number;
  damping?: number;
}

export function NumberTween({
  value,
  format = (n) => String(Math.round(n)),
  className,
  stiffness = 320,
  damping = 30,
}: NumberTweenProps) {
  const reduceMotion = useReducedMotion();
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness, damping });
  const text = useTransform(spring, (n) => format(n));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      // Mount: no animation on first paint (docs/06 §6.4 — tween only on
      // change caused by a filter/save switch).
      first.current = false;
      mv.set(value);
      return;
    }
    if (reduceMotion) {
      mv.jump(value);
      return;
    }
    mv.set(value);
  }, [value, reduceMotion, mv]);

  return (
    <motion.span className={className} data-testid="number-tween">
      {text}
    </motion.span>
  );
}
