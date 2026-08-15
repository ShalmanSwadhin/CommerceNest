import { motion, useScroll, useSpring, useReducedMotion } from 'framer-motion';

/** Thin fixed progress bar tracking scroll depth down the current page. */
export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 30, restDelta: 0.001 });
  const reduce = useReducedMotion();

  if (reduce) return null;

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-brand-gradient"
      aria-hidden
    />
  );
}
