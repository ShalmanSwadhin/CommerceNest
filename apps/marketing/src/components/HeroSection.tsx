import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { homeContent } from '@/content/home';
import { HeroLaptopMockup } from './HeroLaptopMockup';
import { HeroPhoneMockup } from './HeroPhoneMockup';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] } },
};

export function HeroSection() {
  const { hero } = homeContent;
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-navy pb-14 pt-6 sm:pb-16 sm:pt-8 lg:pb-20 lg:pt-10">
      <div className="pointer-events-none absolute inset-0 bg-hero-radial" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[8%] h-[420px] w-[420px] rounded-full bg-[#6C1DB3]/30 blur-[100px]"
        animate={reduce ? undefined : { x: [0, -24, 0], y: [0, 18, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute bottom-[10%] left-[20%] h-[260px] w-[260px] rounded-full bg-[#A855F7]/15 blur-[90px]"
        animate={reduce ? undefined : { x: [0, 20, 0], y: [0, -16, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Desktop: text LEFT · mockups RIGHT (first viewport). Mobile: text then devices. */}
      <div className="relative mx-auto grid max-w-6xl items-start gap-8 px-4 sm:px-6 md:grid-cols-[1fr_1.05fr] md:gap-6 lg:gap-10 lg:px-8 xl:max-w-7xl xl:gap-12">
        {/* LEFT — copy, staggered entrance */}
        <motion.div
          variants={reduce ? undefined : container}
          initial={reduce ? undefined : 'hidden'}
          animate={reduce ? undefined : 'show'}
          className="relative z-10 md:pt-2"
        >
          <motion.div
            variants={reduce ? undefined : staggerItem}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span
              className="inline-flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px] border border-white/20"
              aria-hidden
            >
              <svg viewBox="0 0 20 14" className="h-full w-full" preserveAspectRatio="none">
                <rect width="20" height="14" fill="#006A4E" />
                <circle cx="9" cy="7" r="4" fill="#F42A41" />
              </svg>
            </span>
            <span className="min-w-0 leading-snug">{hero.badge}</span>
          </motion.div>

          <motion.h1
            variants={reduce ? undefined : staggerItem}
            className="mt-4 text-[2rem] font-extrabold leading-[1.08] tracking-tight text-white sm:mt-5 sm:text-4xl md:text-[2.35rem] lg:text-[3rem] xl:text-[3.35rem]"
          >
            {hero.headlineLead}{' '}
            <span className="text-gradient-brand">{hero.headlineEmphasis}</span>
            <br className="hidden sm:block" /> {hero.headlineTrail}
          </motion.h1>

          <motion.p
            variants={reduce ? undefined : staggerItem}
            className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base lg:text-lg"
          >
            {hero.supporting}
          </motion.p>

          <motion.ul
            variants={reduce ? undefined : staggerItem}
            className="mt-5 space-y-2.5 lg:mt-6 lg:space-y-3"
          >
            {hero.bullets.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm text-slate-200 sm:text-[15px]"
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/25 text-brand-bright">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </motion.ul>

          <motion.div
            variants={reduce ? undefined : staggerItem}
            className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-7"
          >
            <motion.div whileHover={reduce ? undefined : { scale: 1.03 }} whileTap={reduce ? undefined : { scale: 0.98 }}>
              <Link
                to={hero.primaryCta.href}
                className="btn-glow relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-gradient px-5 text-sm font-semibold text-white no-underline transition duration-200 lg:h-12 lg:px-6"
              >
                {hero.primaryCta.label}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </motion.div>
            <motion.a
              whileHover={reduce ? undefined : { scale: 1.03 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              href={hero.secondaryCta.href}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/25 bg-transparent px-5 text-sm font-semibold text-white no-underline transition hover:border-white/50 hover:bg-white/5 lg:h-12 lg:px-6"
            >
              {hero.secondaryCta.label}
            </motion.a>
          </motion.div>

          <motion.p
            variants={reduce ? undefined : staggerItem}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-400"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
            No credit card required
          </motion.p>

          <motion.div variants={reduce ? undefined : staggerItem} className="mt-6 flex items-center gap-3 lg:mt-7">
            <div className="flex -space-x-2" aria-hidden>
              {['AH', 'RA', 'NJ', 'SK'].map((initials, i) => (
                <span
                  key={initials}
                  className="grid h-8 w-8 place-items-center rounded-full border-2 border-navy text-[10px] font-bold text-white"
                  style={{
                    background: `linear-gradient(135deg, hsl(${260 + i * 18} 70% 45%), hsl(${280 + i * 12} 65% 35%))`,
                  }}
                >
                  {initials}
                </span>
              ))}
            </div>
            <div>
              <div className="flex text-amber-400" aria-label="5 out of 5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i}>★</span>
                ))}
              </div>
              <p className="text-xs text-slate-400 sm:text-sm">{hero.trustLine}</p>
            </div>
          </motion.div>
        </motion.div>

        {/* RIGHT — laptop + phone, top-aligned beside headline */}
        <div className="relative mx-auto w-full max-w-[520px] pb-20 pt-2 md:max-w-none md:pb-24 md:pt-1 lg:pb-28">
          <div className="absolute right-0 top-0 z-30 hidden sm:block md:-right-1 lg:-right-2">
            <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-brand-gradient p-[2px] shadow-glow-sm animate-float-slow lg:h-[88px] lg:w-[88px]">
              <div className="grid h-full w-full place-items-center rounded-full bg-navy px-2 text-center">
                <span className="text-[9px] font-bold leading-tight text-white lg:text-[10px]">
                  {hero.floatingBadge}
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10">
            <HeroLaptopMockup />
            {/*
              Phone overlaps the LOWER half of the laptop (not bottom-anchored).
              Bottom-anchoring made a tall phone shoot above the hero and get clipped.
            */}
            <div className="absolute left-[-2%] top-[38%] z-20 w-[37%] min-w-[124px] max-w-[174px] sm:left-[-4%] sm:top-[36%] sm:w-[40%] sm:max-w-[185px] md:left-[-5%] lg:left-[-3%] lg:max-w-[190px]">
              <HeroPhoneMockup />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
