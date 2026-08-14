import { homeContent } from '@/content/home';
import { ScrollReveal } from './ScrollReveal';

export function FaqSection() {
  const { faq } = homeContent;

  return (
    <section id={faq.id} className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">
            {faq.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {faq.title}
          </h2>
        </ScrollReveal>

        <div className="mt-10 space-y-3">
          {faq.items.map((item, index) => (
            <ScrollReveal key={item.id} delayMs={index * 40}>
              {/* Native <details>/<summary> — free keyboard support, no JS state. */}
              <details className="group rounded-2xl border border-slate-200 bg-mist p-5 open:bg-white open:shadow-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-ink marker:content-none">
                  {item.question}
                  <span
                    className="shrink-0 text-lg text-ink-muted transition-transform group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{item.answer}</p>
              </details>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
