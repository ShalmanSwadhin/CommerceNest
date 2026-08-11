import {
  Layers,
  MapPin,
  Shield,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { homeContent } from '@/content/home';

const icons: Record<string, LucideIcon> = {
  layers: Layers,
  shield: Shield,
  zap: Zap,
  map: MapPin,
  spark: Sparkles,
};

export function TrustStrip() {
  return (
    <section
      className="relative border-y border-white/5 bg-navy-raised"
      aria-label="Platform values"
    >
      <div className="mx-auto grid max-w-6xl gap-2 px-4 py-8 sm:grid-cols-2 sm:px-6 md:grid-cols-3 lg:grid-cols-5 lg:px-8">
        {homeContent.trustStrip.map((item) => {
          const Icon = icons[item.icon] ?? Layers;
          return (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-xl px-3 py-2 text-left"
            >
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand/15 text-brand-bright">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{item.title}</span>
                <span className="mt-0.5 block text-xs text-slate-400">{item.subtitle}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
