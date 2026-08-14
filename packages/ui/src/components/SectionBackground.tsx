import { useState, type CSSProperties, type ReactNode } from 'react';
import { buildSrcSet } from '../lib/cloudinaryImage';

export type SectionBackgroundType = 'none' | 'color' | 'gradient' | 'image';
export type SectionBackgroundPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';
export type SectionOverlayType = 'none' | 'dark' | 'light' | 'custom';

export interface SectionBackgroundProps {
  type: SectionBackgroundType;
  /** Image URL — Cloudinary URLs get a real responsive srcset for free;
   * any other URL (pasted external link, local-dev base64 fallback) just
   * renders at its natural size, which is correct since no CDN transform
   * is possible for those. */
  image?: string;
  position?: SectionBackgroundPosition;
  /** Solid color for `type: 'color'`. */
  color?: string;
  gradientFrom: string;
  gradientTo: string;
  overlayType?: SectionOverlayType;
  overlayColor?: string;
  /** 0-100 */
  overlayOpacity?: number;
  /** Skips `loading="lazy"` for above-the-fold heroes so the browser
   * fetches immediately instead of waiting to know it's in view. */
  priority?: boolean;
  className?: string;
  children?: ReactNode;
}

const OBJECT_POSITION: Record<SectionBackgroundPosition, string> = {
  center: 'center',
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) };
}

function overlayStyle(
  type: SectionOverlayType,
  color: string,
  opacity: number,
): CSSProperties | null {
  if (type === 'none') return null;
  const alpha = Math.max(0, Math.min(100, opacity)) / 100;
  if (type === 'dark') return { background: `rgba(5, 8, 22, ${alpha})` };
  if (type === 'light') return { background: `rgba(255, 255, 255, ${alpha})` };
  const rgb = hexToRgb(color) || { r: 11, g: 16, b: 35 };
  return { background: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` };
}

/**
 * Shared background layer for theme sections (Hero, Promotional Banner, and
 * any future image-enabled section). Used identically by the Theme Builder
 * preview and the real storefront, so what a merchant sees while editing is
 * exactly what customers see.
 *
 * Renders up to three stacked layers so a missing/broken image never
 * leaves a blank hero:
 *   1. color/gradient base (skipped entirely for `type: 'none'`, which is
 *      fully transparent — see `SectionBackgroundType`)
 *   2. the image, if any — hidden automatically via onError if it fails
 *   3. the overlay, if any
 */
export function SectionBackground({
  type,
  image,
  position = 'center',
  color,
  gradientFrom,
  gradientTo,
  overlayType = 'none',
  overlayColor = '#0B1023',
  overlayOpacity = 45,
  priority = false,
  className,
  children,
}: SectionBackgroundProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = type === 'image' && Boolean(image) && !imageFailed;

  // 'none' renders no base layer at all — transparent, so the section
  // shows whatever sits behind it (the page background), matching how
  // sections that predate this system have always looked. This is
  // intentionally distinct from 'color', which is a real, visible fill.
  const baseStyle: CSSProperties | null =
    type === 'none'
      ? null
      : type === 'color'
        ? { background: color || gradientFrom }
        : { background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` };

  const overlay = overlayStyle(overlayType, overlayColor, overlayOpacity);
  const isCloudinary = Boolean(image && image.includes('res.cloudinary.com'));

  // No hardcoded `relative` here: every real caller passes
  // className="absolute inset-0" to pin this against a `relative` ancestor,
  // and `position: absolute` already establishes a valid containing block
  // for the absolutely-positioned image/overlay children below — adding
  // `relative` too would conflict with that `absolute` utility class (both
  // set `position`, and Tailwind's generated stylesheet order decides the
  // winner, not class order), which silently collapsed this wrapper to
  // zero height.
  return (
    <div className={`overflow-hidden ${className || 'relative'}`}>
      {baseStyle ? <div className="absolute inset-0" style={baseStyle} aria-hidden /> : null}
      {showImage && image ? (
        <img
          src={image}
          srcSet={isCloudinary ? buildSrcSet(image) : undefined}
          sizes={isCloudinary ? '100vw' : undefined}
          alt=""
          aria-hidden="true"
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: OBJECT_POSITION[position] }}
        />
      ) : null}
      {overlay ? <div className="absolute inset-0" style={overlay} aria-hidden /> : null}
      <div className="relative">{children}</div>
    </div>
  );
}
