import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteFooter } from '@/components/SiteFooter';
import { ApiClientError, publicApi, type TrialLeadResult } from '@/lib/api';
import { usePageMeta } from '@/lib/pageMeta';
import { appLoginUrl } from '@/lib/urls';

const CATEGORIES = [
  'Electronics',
  'Fashion',
  'Grocery',
  'Beauty & Cosmetics',
  'Restaurant/Food',
  'Mobile/Accessories',
  'General Business',
  'Other',
];

const CATALOG_SIZES = ['Just a few products', '10–50 products', '50–200 products', '200+ products'];

export function TrialRequestPage() {
  usePageMeta({
    title: 'Start Your Free Trial — CommerceNest',
    description:
      'Request a free CommerceNest trial store — get a real, working storefront instantly, no payment required.',
    path: '/trial',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrialLeadResult | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const input = {
      prospectName: String(form.get('prospectName') || '').trim(),
      businessName: String(form.get('businessName') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      email: String(form.get('email') || '').trim(),
      password,
      confirmPassword,
      category: String(form.get('category') || '').trim() || undefined,
      catalogSize: String(form.get('catalogSize') || '').trim() || undefined,
      message: String(form.get('message') || '').trim() || undefined,
    };

    setSubmitting(true);
    try {
      const res = await publicApi.requestTrial(input);
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Something went wrong creating your trial store. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-navy">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <BrandLogo />
          <Link to="/" className="text-sm font-medium text-white/80 hover:text-white">
            ← Back to homepage
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-16">
        {!result ? (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              Try Your Store Free
            </h1>
            <p className="mt-3 text-base leading-relaxed text-ink-secondary">
              Tell us a bit about your business and we'll spin up a real, working
              storefront you can explore right away — no payment required.
            </p>

            <form
              onSubmit={onSubmit}
              className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-ink">
                  Your name
                  <input
                    name="prospectName"
                    required
                    minLength={2}
                    maxLength={120}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                    autoComplete="name"
                  />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Business name
                  <input
                    name="businessName"
                    required
                    minLength={2}
                    maxLength={150}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                  />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Phone number
                  <input
                    name="phone"
                    required
                    minLength={6}
                    maxLength={20}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                    autoComplete="tel"
                    placeholder="01XXXXXXXXX"
                  />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Email
                  <input
                    name="email"
                    type="email"
                    required
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                    autoComplete="email"
                  />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                  />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Confirm password
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                    autoComplete="new-password"
                  />
                </label>
                <p className="-mt-2 text-xs text-ink-muted sm:col-span-2">
                  You'll use this password to log into your CommerceNest merchant dashboard later.
                </p>
                <label className="block text-sm font-medium text-ink">
                  Business category
                  <select
                    name="category"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-ink">
                  Approximate catalog size
                  <select
                    name="catalogSize"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a size
                    </option>
                    {CATALOG_SIZES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-4 block text-sm font-medium text-ink">
                Anything else we should know? (optional)
                <textarea
                  name="message"
                  rows={3}
                  maxLength={2000}
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                  placeholder="E.g. what you sell, or questions about CommerceNest"
                />
              </label>

              {error ? (
                <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Creating your trial store…' : 'Request a Free Trial Store'}
              </button>
              <p className="mt-3 text-center text-xs text-ink-muted">
                We'll create a real, working storefront you can explore immediately.
              </p>
            </form>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card sm:p-10">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="size-7" />
            </div>
            <h1 className="text-2xl font-bold text-ink">Your trial store is ready!</h1>
            <p className="mt-2 text-sm text-ink-secondary">
              {result.businessName} now has a live storefront. Explore it below —
              it's yours to try, no strings attached.
            </p>
            <a
              href={result.trialUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Open your trial store
              <ExternalLink className="h-4 w-4" />
            </a>
            <p className="mt-4 break-all rounded-xl bg-mist px-4 py-3 font-mono text-xs text-ink-secondary">
              {result.trialUrl}
            </p>
            <p className="mt-4 text-xs text-ink-muted">
              Trial expires {new Date(result.trialExpiresAt).toLocaleDateString()}. Our
              team will reach out to help you get set up.
            </p>
            <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-ink-secondary">
              Manage your store, products and orders from your merchant dashboard —
              log in anytime with the email and password you just set.
            </p>
            <a
              href={appLoginUrl()}
              className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-ink transition hover:bg-mist"
            >
              Go to merchant dashboard
            </a>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
