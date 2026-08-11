import { Link } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { homeContent } from '@/content/home';
import { supportEmail } from '@/lib/urls';

export function SiteFooter() {
  const { footer, brand } = homeContent;
  const email = supportEmail();

  return (
    <footer className="border-t border-white/5 bg-navy text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-4">
          <BrandLogo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
            {brand.description}
          </p>
          <p className="mt-4 text-sm text-slate-500">{footer.supportBlurb}</p>
          {email && (
            <a
              href={`mailto:${email}`}
              className="mt-3 inline-block text-sm font-medium text-brand-bright no-underline hover:underline"
            >
              {email}
            </a>
          )}
        </div>

        {footer.columns.map((column) => (
          <div key={column.title} className="lg:col-span-2">
            <h3 className="text-sm font-bold text-white">{column.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  {link.href.startsWith('/') ? (
                    <Link
                      to={link.href}
                      className="text-sm text-slate-400 no-underline transition hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      className="text-sm text-slate-400 no-underline transition hover:text-white"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="lg:col-span-2" id="resources">
          <h3 className="text-sm font-bold text-white">Support</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
            <li>
              <a href="#contact" className="no-underline transition hover:text-white">
                Contact form
              </a>
            </li>
            <li>Bangladesh</li>
            {email ? (
              <li>
                <a href={`mailto:${email}`} className="no-underline transition hover:text-white">
                  {email}
                </a>
              </li>
            ) : (
              <li>Support channels open with early-access onboarding</li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>{footer.copyright}</p>
          <div className="flex gap-4">
            <Link to="/terms" className="no-underline hover:text-white">
              Terms of Service
            </Link>
            <Link to="/privacy" className="no-underline hover:text-white">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
