import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { homeContent } from '@/content/home';
import { publicApi, type PublicPackage } from '@/lib/api';
import { ScrollReveal } from './ScrollReveal';

function formatBdt(value: string | number) {
  const n = Number(value);
  return `৳${n.toLocaleString('en-US')}`;
}

function PricingCard({ pkg, index }: { pkg: PublicPackage; index: number }) {
  return (
    <ScrollReveal delayMs={index * 90} variant="up">
      <motion.article
        whileHover={{ y: -6 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        className={`relative flex h-full flex-col rounded-2xl border p-6 sm:p-8 ${
          pkg.featured
            ? 'border-brand/30 bg-navy text-white shadow-glow'
            : 'border-slate-200 bg-white shadow-card'
        }`}
      >
        {pkg.featured ? (
          <motion.span
            animate={{ opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold text-white"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Most popular
          </motion.span>
        ) : null}
        <h3 className={`text-xl font-bold ${pkg.featured ? 'text-white' : 'text-ink'}`}>
          {pkg.name}
        </h3>
        {pkg.description ? (
          <p className={`mt-1 text-sm ${pkg.featured ? 'text-slate-300' : 'text-ink-secondary'}`}>
            {pkg.description}
          </p>
        ) : null}
        <div className="mt-5 flex items-baseline gap-1">
          <span className={`text-3xl font-extrabold ${pkg.featured ? 'text-white' : 'text-ink'}`}>
            {formatBdt(pkg.monthlyPrice)}
          </span>
          <span className={`text-sm ${pkg.featured ? 'text-slate-400' : 'text-ink-secondary'}`}>
            /month
          </span>
        </div>
        <div className={`mt-3 space-y-1 text-sm ${pkg.featured ? 'text-slate-300' : 'text-ink-secondary'}`}>
          <p>Up to {pkg.maxProducts ?? 'unlimited'} active products</p>
          <p>{pkg.maxStaff ?? 'Unlimited'} staff accounts</p>
          <p className="font-medium">+ {(pkg.platformFeeRate * 100).toFixed(2)}% platform fee</p>
        </div>
        <ul className="mt-6 flex-1 space-y-2.5">
          {pkg.features.slice(0, 6).map((feature) => (
            <li
              key={feature}
              className={`flex items-start gap-2 text-sm ${
                pkg.featured ? 'text-slate-300' : 'text-ink-secondary'
              }`}
            >
              <Check
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  pkg.featured ? 'text-brand-bright' : 'text-brand'
                }`}
              />
              {feature}
            </li>
          ))}
        </ul>
        <Link
          to="/trial"
          className={`mt-8 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold no-underline transition ${
            pkg.featured
              ? 'btn-glow bg-brand-gradient text-white hover:brightness-110'
              : 'border border-slate-200 text-ink hover:border-brand/40 hover:bg-brand/5'
          }`}
        >
          Start Free Trial
        </Link>
        <p
          className={`mt-2 text-center text-xs ${pkg.featured ? 'text-slate-400' : 'text-ink-tertiary'}`}
        >
          No credit card required
        </p>
      </motion.article>
    </ScrollReveal>
  );
}

export function PricingSection() {
  const { pricingTeaser } = homeContent;
  const [packages, setPackages] = useState<PublicPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    publicApi
      .listPackages()
      .then((res) => {
        if (!cancelled) setPackages(res.items);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load pricing right now.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id={pricingTeaser.id} className="scroll-mt-20 bg-mist py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Pricing</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {pricingTeaser.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-secondary">
            {pricingTeaser.supporting}
          </p>
        </ScrollReveal>

        {error ? (
          <p className="mx-auto mt-12 max-w-md rounded-xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-600">
            {error}
          </p>
        ) : null}

        {!packages && !error ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl bg-white/60" />
            ))}
          </div>
        ) : null}

        {packages ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg, index) => (
              <PricingCard key={pkg.id} pkg={pkg} index={index} />
            ))}
          </div>
        ) : null}

        <ScrollReveal className="mt-10 text-center" delayMs={120}>
          <Link
            to={pricingTeaser.cta.href}
            className="inline-flex text-sm font-semibold text-brand no-underline hover:underline"
          >
            {pricingTeaser.cta.label} — full feature comparison →
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
