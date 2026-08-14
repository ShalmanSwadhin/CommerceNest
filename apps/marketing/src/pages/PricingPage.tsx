import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { SiteNavbar } from '@/components/SiteNavbar';
import { SiteFooter } from '@/components/SiteFooter';
import { NavAnchorLink } from '@/components/NavAnchorLink';
import { publicApi, type PublicPackage } from '@/lib/api';
import { usePageMeta } from '@/lib/pageMeta';

function formatBdt(value: string | number) {
  const n = Number(value);
  return `৳${n.toLocaleString('en-US')}`;
}

export function PricingPage() {
  usePageMeta({
    title: 'Pricing — CommerceNest',
    description:
      'Simple, transparent CommerceNest pricing in Bangladeshi Taka. Starter, Business, and Pro plans — start with a free trial.',
    path: '/pricing',
  });
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
        if (!cancelled) setError('Could not load pricing right now. Please try again shortly.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-navy">
      <SiteNavbar />
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Choose the plan that fits your business
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            Simple, transparent pricing in Bangladeshi Taka. Start free, upgrade any
            time.
          </p>
        </div>

        {error ? (
          <p className="mx-auto mt-12 max-w-md rounded-xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {!packages && !error ? (
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : null}

        {packages ? (
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className={`flex flex-col rounded-2xl border p-6 sm:p-8 ${
                  pkg.featured
                    ? 'border-brand bg-white shadow-2xl ring-2 ring-brand'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                {pkg.featured ? (
                  <span className="mb-3 inline-flex w-fit items-center rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                    Most popular
                  </span>
                ) : null}
                <h2 className={`text-xl font-bold ${pkg.featured ? 'text-ink' : 'text-white'}`}>
                  {pkg.name}
                </h2>
                {pkg.description ? (
                  <p className={`mt-1 text-sm ${pkg.featured ? 'text-ink-secondary' : 'text-white/60'}`}>
                    {pkg.description}
                  </p>
                ) : null}
                <div className="mt-5 flex items-baseline gap-1">
                  <span className={`text-3xl font-extrabold ${pkg.featured ? 'text-ink' : 'text-white'}`}>
                    {formatBdt(pkg.monthlyPrice)}
                  </span>
                  <span className={pkg.featured ? 'text-sm text-ink-secondary' : 'text-sm text-white/60'}>
                    /month
                  </span>
                </div>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {pkg.features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex items-start gap-2 text-sm ${
                        pkg.featured ? 'text-ink-secondary' : 'text-white/75'
                      }`}
                    >
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          pkg.featured ? 'text-brand' : 'text-emerald-400'
                        }`}
                      />
                      {feature}
                    </li>
                  ))}
                  <li
                    className={`flex items-start gap-2 text-sm ${
                      pkg.featured ? 'text-ink-secondary' : 'text-white/75'
                    }`}
                  >
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        pkg.featured ? 'text-brand' : 'text-emerald-400'
                      }`}
                    />
                    Custom theme:{' '}
                    {pkg.customThemeAvailability === 'INCLUDED'
                      ? 'Included'
                      : 'Available as add-on'}
                  </li>
                </ul>
                <Link
                  to="/trial"
                  className={`mt-8 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition ${
                    pkg.featured
                      ? 'bg-brand-gradient text-white hover:brightness-110'
                      : 'border border-white/20 text-white hover:bg-white/10'
                  }`}
                >
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
        ) : null}

        <p className="mx-auto mt-12 max-w-lg text-center text-sm text-white/60">
          Need something larger, or have questions?{' '}
          <NavAnchorLink href="#contact" className="font-semibold text-white underline">
            Contact CommerceNest
          </NavAnchorLink>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
