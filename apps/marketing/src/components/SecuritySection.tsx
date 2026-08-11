import {
  Flag,
  Lock,
  ShieldCheck,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { homeContent } from '@/content/home';
import { ScrollReveal } from './ScrollReveal';

const iconById: Record<string, LucideIcon> = {
  secure: Lock,
  tenant: ShieldCheck,
  admin: Store,
  bkash: Wallet,
  cod: Truck,
  bd: Flag,
};

export function SecuritySection() {
  const { security } = homeContent;

  return (
    <section id="security" className="border-y border-slate-200 bg-mist py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {security.title}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Trust signals based on real CommerceNest product capabilities.
          </p>
        </ScrollReveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {security.items.map((item, index) => {
            const Icon = iconById[item.id] ?? ShieldCheck;
            return (
              <ScrollReveal key={item.id} delayMs={index * 40}>
                <div className="flex h-full flex-col items-center rounded-2xl border border-slate-200 bg-white px-4 py-5 text-center shadow-card">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-3 text-sm font-bold text-ink">{item.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{item.detail}</p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
