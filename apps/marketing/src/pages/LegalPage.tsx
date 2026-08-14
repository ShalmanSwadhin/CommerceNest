import { Link, useLocation } from 'react-router-dom';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteFooter } from '@/components/SiteFooter';
import { usePageMeta } from '@/lib/pageMeta';

type LegalPageProps = {
  title: string;
  body: string;
};

export function LegalPage({ title, body }: LegalPageProps) {
  const { pathname } = useLocation();
  usePageMeta({
    title: `${title} — CommerceNest`,
    description: body.slice(0, 155),
    path: pathname,
  });
  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-navy">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <BrandLogo />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm">
          <Link to="/" className="font-medium text-brand no-underline hover:underline">
            ← Back to homepage
          </Link>
        </p>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="mt-6 text-base leading-relaxed text-ink-secondary">{body}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
