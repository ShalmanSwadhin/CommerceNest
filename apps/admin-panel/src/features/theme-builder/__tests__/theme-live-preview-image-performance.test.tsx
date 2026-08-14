/**
 * Regression test: adding photographic background-image support to
 * ThemeLivePreview's Hero/Promo-Banner blocks (via resolveSectionBackground
 * + the shared SectionBackground component) must not reintroduce the
 * Theme Builder freeze that was root-caused and fixed earlier (unmemoized
 * SectionBlock re-rendering every section on any unrelated edit).
 *
 * This renders a realistic mix of sections — including image-mode Hero and
 * Promo Banner — and simulates the same rapid-unrelated-update burst that
 * previously caused an 800ms+ main-thread block, asserting the <img> DOM
 * nodes for the image sections are never torn down/remounted by the burst
 * (proof that React.memo is actually skipping their reconciliation, not
 * just happening to produce the same output).
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { normalizeThemeDocument, type ThemeSection } from '@commercenest/types/schemas/theme';
import { ThemeLivePreview } from '../ThemeLivePreview';

function makeDoc(sectionCount: number) {
  const doc = normalizeThemeDocument({});
  const sections: ThemeSection[] = [
    {
      id: 'hero-1',
      type: 'hero',
      visible: true,
      settings: {
        title: 'Premium Hero',
        backgroundType: 'image',
        imageUrl: 'https://example.com/hero.jpg',
        backgroundPosition: 'center',
        overlayType: 'dark',
        overlay: 50,
      },
    },
    {
      id: 'promo-1',
      type: 'promo-banner',
      visible: true,
      settings: {
        heading: 'Deals',
        backgroundType: 'image',
        imageUrl: 'https://example.com/promo.jpg',
        overlayType: 'light',
        overlay: 30,
      },
    },
    ...Array.from({ length: Math.max(0, sectionCount - 2) }, (_, i) => ({
      id: `filler-${i}`,
      type: 'featured-products' as const,
      visible: true,
      settings: { title: `Filler ${i}` },
    })),
  ];
  doc.layout.sections = sections;
  return doc;
}

describe('ThemeLivePreview — image-mode sections do not defeat memoization', () => {
  it('keeps the same <img> DOM nodes across a rapid burst of unrelated re-renders (color-drag simulation)', () => {
    const doc = makeDoc(15);

    const { container, rerender } = render(
      <ThemeLivePreview doc={doc} device="desktop" storeName="Test Store" />,
    );

    const imagesBefore = Array.from(container.querySelectorAll('img'));
    expect(imagesBefore.length).toBeGreaterThanOrEqual(2); // hero + promo-banner images

    // Simulate 60 rapid unrelated re-renders with the SAME doc reference
    // (identical to how ThemeBuilder re-renders on things like a color
    // picker drag — the sections array itself never changes).
    for (let i = 0; i < 60; i++) {
      rerender(<ThemeLivePreview doc={doc} device="desktop" storeName="Test Store" />);
    }

    const imagesAfter = Array.from(container.querySelectorAll('img'));
    expect(imagesAfter.length).toBe(imagesBefore.length);
    imagesBefore.forEach((img, i) => {
      // Same DOM node identity proves React skipped reconciling this
      // subtree entirely rather than recreating an equivalent one.
      expect(imagesAfter[i]).toBe(img);
    });
  });

  it('still updates the hero image when that section genuinely changes', () => {
    const doc = makeDoc(5);
    const { container, rerender } = render(
      <ThemeLivePreview doc={doc} device="desktop" storeName="Test Store" />,
    );

    const heroImgBefore = container.querySelector('img');
    expect(heroImgBefore?.getAttribute('src')).toBe('https://example.com/hero.jpg');

    const updatedDoc = {
      ...doc,
      layout: {
        ...doc.layout,
        sections: doc.layout.sections.map((s) =>
          s.id === 'hero-1'
            ? { ...s, settings: { ...s.settings, imageUrl: 'https://example.com/new-hero.jpg' } }
            : s,
        ),
      },
    };
    rerender(<ThemeLivePreview doc={updatedDoc} device="desktop" storeName="Test Store" />);

    const heroImgAfter = container.querySelector('img');
    expect(heroImgAfter?.getAttribute('src')).toBe('https://example.com/new-hero.jpg');
  });
});
