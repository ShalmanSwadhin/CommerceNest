import { FormEvent, useState } from 'react';
import { homeContent } from '@/content/home';
import { supportEmail } from '@/lib/urls';
import { ScrollReveal } from './ScrollReveal';

export function ContactSection() {
  const { contact } = homeContent;
  const [status, setStatus] = useState<'idle' | 'ready'>('idle');

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') || '').trim();
    const email = String(form.get('email') || '').trim();
    const message = String(form.get('message') || '').trim();
    const intent = String(form.get('intent') || 'demo').trim();

    const to = supportEmail();
    if (to) {
      const subject = encodeURIComponent(`CommerceNest ${intent} — ${name}`);
      const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nIntent: ${intent}\n\n${message}`,
      );
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    }
    setStatus('ready');
  }

  return (
    <section id="contact" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <ScrollReveal>
          <h2 className="text-3xl font-extrabold tracking-tight text-ink">
            {contact.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-secondary">
            {contact.supporting}
          </p>
          <ul className="mt-6 space-y-2 text-sm text-ink-secondary">
            <li>Request a product demo</li>
            <li>Ask about early access / trial onboarding</li>
            <li>Discuss multi-store platform needs</li>
          </ul>
          {supportEmail() && (
            <p className="mt-6 text-sm text-ink-muted">
              Email:{' '}
              <a className="font-semibold text-brand" href={`mailto:${supportEmail()}`}>
                {supportEmail()}
              </a>
            </p>
          )}
        </ScrollReveal>

        <ScrollReveal delayMs={80}>
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-slate-200 bg-mist p-6 shadow-card sm:p-8"
          >
            <div className="grid gap-4">
              <label className="block text-sm font-medium text-ink">
                Name
                <input
                  name="name"
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                  autoComplete="name"
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                Work email
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                I am interested in
                <select
                  name="intent"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                  defaultValue="trial"
                >
                  <option value="trial">14-day free trial conversation</option>
                  <option value="demo">Product demo</option>
                  <option value="pricing">Pricing</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-ink">
                Message
                <textarea
                  name="message"
                  required
                  rows={4}
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                  placeholder="Tell us about your stores and goals"
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand-gradient text-sm font-semibold text-white transition hover:brightness-110"
            >
              Send message
            </button>
            {status === 'ready' && (
              <p className="mt-3 text-sm text-emerald-700" role="status">
                {contact.success}
              </p>
            )}
          </form>
        </ScrollReveal>
      </div>
    </section>
  );
}
