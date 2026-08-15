import { useRef, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

type RevealVariant = 'up' | 'scale' | 'left' | 'right';

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  variant?: RevealVariant;
};

const OFFSETS: Record<RevealVariant, { x?: number; y?: number; scale?: number }> = {
  up: { y: 22 },
  scale: { y: 12, scale: 0.94 },
  left: { x: -28 },
  right: { x: 28 },
};

/**
 * Scroll-triggered entrance animation, used throughout the marketing
 * homepage. Fires once (never re-hides on scroll back up — repeatedly
 * animating content in and out while scrolling is distracting, not
 * "impressive"). Respects prefers-reduced-motion by skipping straight to
 * the resting state.
 */
export function ScrollReveal({
  children,
  className = '',
  delayMs = 0,
  variant = 'up',
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -80px 0px', amount: 0.12 });
  const reduce = useReducedMotion();
  const offset = OFFSETS[variant];

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: offset.x ?? 0, y: offset.y ?? 0, scale: offset.scale ?? 1 }}
      animate={inView ? { opacity: 1, x: 0, y: 0, scale: 1 } : undefined}
      transition={{ duration: 0.6, delay: delayMs / 1000, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
