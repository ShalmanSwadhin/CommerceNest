import { homeContent } from '@/content/home';
import { ScrollReveal } from './ScrollReveal';

export function HowItWorksSection() {
  const { howItWorks } = homeContent;

  return (
    <section id={howItWorks.id} className="scroll-mt-20 bg-mist py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">
            {howItWorks.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {howItWorks.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-secondary">
            {howItWorks.supporting}
          </p>
        </ScrollReveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorks.steps.map((step, index) => (
            <ScrollReveal key={step.id} delayMs={index * 60}>
              <div className="relative h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                  {step.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
