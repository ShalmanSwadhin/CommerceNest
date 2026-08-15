import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { homeContent } from '@/content/home';
import { ScrollReveal } from './ScrollReveal';

export function FinalCTA() {
  const { finalCta } = homeContent;
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-brand-gradient py-16 sm:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_45%)]" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-16 bottom-[-20%] h-64 w-64 rounded-full bg-white/10 blur-[80px]"
        animate={reduce ? undefined : { x: [0, 24, 0], y: [0, -14, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <ScrollReveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6" variant="scale">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {finalCta.title}
        </h2>
        <p className="mt-4 text-base text-white/85">
          {finalCta.supporting} Start a free trial conversation — no credit card required.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <motion.div
            whileHover={reduce ? undefined : { scale: 1.04 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
          >
            <Link
              to={finalCta.primary.href}
              className="inline-flex h-12 min-w-[180px] items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-brand no-underline shadow-lift transition hover:bg-slate-50"
            >
              {finalCta.primary.label}
            </Link>
          </motion.div>
          <motion.a
            whileHover={reduce ? undefined : { scale: 1.04 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            href={finalCta.secondary.href}
            className="inline-flex h-12 min-w-[180px] items-center justify-center rounded-xl border border-white/50 bg-transparent px-6 text-sm font-semibold text-white no-underline transition hover:bg-white/10"
          >
            {finalCta.secondary.label}
          </motion.a>
        </div>
      </ScrollReveal>
    </section>
  );
}
