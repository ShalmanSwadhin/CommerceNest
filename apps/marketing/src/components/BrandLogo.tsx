import { Link } from 'react-router-dom';
import { homeContent } from '@/content/home';

type BrandLogoProps = {
  variant?: 'light' | 'dark';
  compact?: boolean;
  to?: string;
};

export function BrandLogo({
  variant = 'light',
  compact = false,
  to = '/',
}: BrandLogoProps) {
  const text = variant === 'light' ? 'text-white' : 'text-ink';
  const muted = variant === 'light' ? 'text-white/55' : 'text-ink-muted';

  return (
    <Link to={to} className="group flex items-center gap-3 no-underline">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-gradient shadow-glow-sm"
        aria-hidden
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2.5 19.5 7v10L12 21.5 4.5 17V7L12 2.5Z"
            stroke="white"
            strokeWidth="1.4"
            strokeLinejoin="round"
            fill="white"
            fillOpacity="0.12"
          />
          <circle cx="12" cy="12" r="3.2" fill="white" />
          <circle cx="12" cy="8.2" r="1.15" fill="white" fillOpacity="0.85" />
          <circle cx="15.2" cy="13.6" r="1.15" fill="white" fillOpacity="0.85" />
          <circle cx="8.8" cy="13.6" r="1.15" fill="white" fillOpacity="0.85" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className={`block text-[15px] font-bold tracking-tight ${text}`}>
          {homeContent.brand.name}
        </span>
        {!compact && (
          <span className={`block text-[11px] font-medium tracking-wide ${muted}`}>
            {homeContent.brand.tagline}
          </span>
        )}
      </span>
    </Link>
  );
}
