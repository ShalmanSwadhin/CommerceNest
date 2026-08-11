import { homeContent } from '@/content/home';
import { ScrollReveal } from './ScrollReveal';

export function FinalCTA() {
  const { finalCta } = homeContent;

  return (
    <section className="relative overflow-hidden bg-brand-gradient py-16 sm:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_45%)]" />
      <ScrollReveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {finalCta.title}
        </h2>
        <p className="mt-4 text-base text-white/85">
          {finalCta.supporting} Start a free trial conversation — no credit card required.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={finalCta.primary.href}
            className="inline-flex h-12 min-w-[180px] items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-brand no-underline shadow-lift transition hover:bg-slate-50"
          >
            {finalCta.primary.label}
          </a>
          <a
            href={finalCta.secondary.href}
            className="inline-flex h-12 min-w-[180px] items-center justify-center rounded-xl border border-white/50 bg-transparent px-6 text-sm font-semibold text-white no-underline transition hover:bg-white/10"
          >
            {finalCta.secondary.label}
          </a>
        </div>
      </ScrollReveal>
    </section>
  );
}
