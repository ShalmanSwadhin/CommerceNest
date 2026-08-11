import { Building2, Layers, Network, Wallet } from 'lucide-react';
import { homeContent } from '@/content/home';
import { ScrollReveal } from './ScrollReveal';

const icons = {
  store: Building2,
  bkash: Wallet,
  tenant: Network,
  platform: Layers,
} as const;

export function StatsSection() {
  const { stats } = homeContent;

  return (
    <section className="bg-mist py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.2fr]">
          <ScrollReveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {stats.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-secondary">
              {stats.supporting}
            </p>
          </ScrollReveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {stats.items.map((item, index) => {
              const Icon = icons[item.icon];
              return (
                <ScrollReveal key={item.id} delayMs={index * 50}>
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <p className="mt-4 text-2xl font-extrabold text-ink">{item.value}</p>
                    <p className="mt-1 text-sm font-medium text-ink-secondary">{item.label}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
