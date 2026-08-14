import { Link } from 'react-router-dom';
import { homeContent } from '@/content/home';
import { ScrollReveal } from './ScrollReveal';

export function BangladeshSection() {
  const { bangladesh, themesTeaser, pricingTeaser } = homeContent;

  return (
    <section id={bangladesh.id} className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <ScrollReveal>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">
              Bangladesh first
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {bangladesh.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-secondary">
              {bangladesh.supporting}
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {bangladesh.highlights.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-mist p-4"
                >
                  <p className="text-sm font-bold text-ink">{item.label}</p>
                  <p className="mt-1 text-xs text-ink-muted">{item.detail}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal delayMs={80}>
            <div className="relative overflow-hidden rounded-3xl bg-navy p-8 text-white shadow-glow sm:p-10">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/40 blur-3xl" />
              <h3 className="relative text-2xl font-extrabold tracking-tight">
                Local payments. Global-grade platform.
              </h3>
              <p className="relative mt-3 text-sm leading-relaxed text-slate-300">
                CommerceNest lets businesses launch, manage and grow their online store
                without needing to build everything themselves — with Manual bKash and COD
                at the center of checkout.
              </p>
              <div className="relative mt-8 flex flex-wrap gap-3">
                {['৳ BDT', 'bKash', 'COD', 'Subdomains'].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <ScrollReveal>
            <div id={themesTeaser.id} className="scroll-mt-20 rounded-2xl border border-slate-200 bg-mist p-8">
              <h3 className="text-xl font-bold text-ink">{themesTeaser.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
                {themesTeaser.supporting}
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delayMs={60}>
            <div
              id={pricingTeaser.id}
              className="scroll-mt-20 rounded-2xl border border-brand/20 bg-brand/5 p-8"
            >
              <h3 className="text-xl font-bold text-ink">{pricingTeaser.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
                {pricingTeaser.supporting}
              </p>
              <Link
                to={pricingTeaser.cta.href}
                className="mt-5 inline-flex text-sm font-semibold text-brand no-underline hover:underline"
              >
                {pricingTeaser.cta.label} →
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
