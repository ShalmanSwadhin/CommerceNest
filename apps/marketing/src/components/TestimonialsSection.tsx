import { Quote } from 'lucide-react';
import { homeContent } from '@/content/home';
import { ScrollReveal } from './ScrollReveal';

export function TestimonialsSection() {
  const { testimonials } = homeContent;

  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {testimonials.title}
          </h2>
          <p className="mt-3 text-sm text-ink-muted">{testimonials.caption}</p>
        </ScrollReveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {testimonials.items.map((item, index) => (
            <ScrollReveal key={item.id} delayMs={index * 70}>
              <figure className="flex h-full flex-col rounded-2xl border border-slate-200 bg-mist p-6 shadow-card">
                <Quote className="h-8 w-8 text-brand" aria-hidden />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-ink-secondary">
                  “{item.quote}”
                </blockquote>
                <div
                  className="mt-4 flex text-amber-400"
                  aria-label={`${item.rating} out of 5 stars`}
                >
                  {Array.from({ length: item.rating }).map((_, i) => (
                    <span key={i}>★</span>
                  ))}
                </div>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-5">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">
                    {item.avatarInitials}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-ink">{item.name}</span>
                    <span className="block text-xs text-ink-muted">{item.business}</span>
                  </span>
                </figcaption>
              </figure>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
