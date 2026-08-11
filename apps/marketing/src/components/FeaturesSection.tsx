import {
  BarChart3,
  Headset,
  Layers,
  Palette,
  Shield,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { homeContent } from '@/content/home';
import { ScrollReveal } from './ScrollReveal';

const icons: Record<(typeof homeContent.features.items)[number]['icon'], LucideIcon> = {
  layers: Layers,
  wallet: Wallet,
  palette: Palette,
  chart: BarChart3,
  shield: Shield,
  headset: Headset,
};

export function FeaturesSection() {
  const { features } = homeContent;

  return (
    <section id="features" className="bg-mist py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">
            {features.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {features.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-secondary">
            {features.supporting}
          </p>
        </ScrollReveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.items.map((feature, index) => {
            const Icon = icons[feature.icon];
            return (
              <ScrollReveal key={feature.id} delayMs={index * 60}>
                <article className="group h-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:border-brand/25 hover:shadow-lift">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-white">
                    <Icon className="h-6 w-6" aria-hidden />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-ink">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                    {feature.description}
                  </p>
                </article>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
