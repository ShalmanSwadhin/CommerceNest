import { describe, expect, it } from 'vitest';
import { normalizeThemeDocument } from '@commercenest/types/schemas/theme';
import { contrastRatio, runThemeHealthCheck } from '../themeHealth';

describe('contrastRatio (real WCAG relative-luminance math)', () => {
  it('computes the well-known black-on-white ratio of 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('computes a ratio of 1:1 for identical colors', () => {
    expect(contrastRatio('#6C1DB3', '#6C1DB3')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    const a = contrastRatio('#111827', '#F7F8FB');
    const b = contrastRatio('#F7F8FB', '#111827');
    expect(a).toBeCloseTo(b!, 10);
  });

  it('accepts 3-digit and 6-digit hex, with or without #', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 0);
    expect(contrastRatio('fff', '000')).toBeCloseTo(21, 0);
  });

  it('returns null for an unparsable color', () => {
    expect(contrastRatio('not-a-color', '#FFFFFF')).toBeNull();
  });
});

describe('runThemeHealthCheck', () => {
  it('passes contrast checks for the platform default theme (dark text on light background)', () => {
    const doc = normalizeThemeDocument({ themeSettings: {} });
    const findings = runThemeHealthCheck(doc);
    const contrastFindings = findings.filter((f) => f.id.startsWith('contrast'));
    expect(contrastFindings.length).toBeGreaterThan(0);
    expect(contrastFindings.every((f) => f.severity === 'pass')).toBe(true);
  });

  it('warns when text and background are nearly identical (unreadable)', () => {
    const doc = normalizeThemeDocument({
      themeSettings: { colors: { text: '#F0F0F0', background: '#FFFFFF' } },
    });
    const finding = runThemeHealthCheck(doc).find((f) => f.id === 'contrast-body');
    expect(finding?.severity).toBe('warn');
  });

  it('warns on a very light primary color paired with white button text', () => {
    const doc = normalizeThemeDocument({
      themeSettings: { colors: { primary: '#FDF2F8' } },
    });
    const finding = runThemeHealthCheck(doc).find((f) => f.id === 'contrast-button');
    expect(finding?.severity).toBe('warn');
  });

  it('passes section-count check for a normal-sized theme and flags a large one', () => {
    const small = normalizeThemeDocument({ themeSettings: {} });
    expect(runThemeHealthCheck(small).find((f) => f.id === 'section-count')?.severity).toBe(
      'pass',
    );

    const manySections = Array.from({ length: 35 }, (_, i) => ({
      id: `s${i}`,
      type: 'newsletter' as const,
      visible: true,
      settings: { title: `Section ${i}` },
    }));
    const large = normalizeThemeDocument({
      layout: { sections: manySections },
      themeSettings: {},
    });
    expect(runThemeHealthCheck(large).find((f) => f.id === 'section-count')?.severity).toBe(
      'warn',
    );
  });

  it('flags a visible section with neither a title nor an image as empty', () => {
    const doc = normalizeThemeDocument({
      layout: {
        sections: [
          { id: 'h1', type: 'hero', visible: true, settings: { title: '', imageUrl: '' } },
        ],
      },
      themeSettings: {},
    });
    const finding = runThemeHealthCheck(doc).find((f) => f.id === 'empty-sections');
    expect(finding?.severity).toBe('warn');
    expect(finding?.detail).toContain('hero');
  });

  it('does not flag a hidden section as empty even with no title/image', () => {
    const doc = normalizeThemeDocument({
      layout: {
        sections: [
          { id: 'h1', type: 'hero', visible: false, settings: { title: '', imageUrl: '' } },
        ],
      },
      themeSettings: {},
    });
    expect(runThemeHealthCheck(doc).find((f) => f.id === 'empty-sections')?.severity).toBe(
      'pass',
    );
  });

  it('flags two adjacent sections of the same type', () => {
    const doc = normalizeThemeDocument({
      layout: {
        sections: [
          { id: 'a', type: 'newsletter', visible: true, settings: {} },
          { id: 'b', type: 'newsletter', visible: true, settings: {} },
        ],
      },
      themeSettings: {},
    });
    expect(
      runThemeHealthCheck(doc).some((f) => f.id === 'duplicate-adjacent' && f.severity === 'warn'),
    ).toBe(true);
  });

  it('flags unedited demo/sample testimonial content', () => {
    const doc = normalizeThemeDocument({ themeSettings: {} });
    // Default sections seed testimonials with the exact demo quote — untouched.
    const finding = runThemeHealthCheck(doc).find((f) => f.id === 'demo-content');
    expect(finding?.severity).toBe('warn');
    expect(finding?.detail).toContain('testimonials');
  });

  it('does not flag demo content once the items have actually been edited', () => {
    const doc = normalizeThemeDocument({ themeSettings: {} });
    // Two default sections ship with sample `items` arrays — edit both, not
    // just one, or the other keeps the finding legitimately alive.
    const testimonials = doc.layout.sections.find((s) => s.type === 'testimonials')!;
    testimonials.settings.items = [{ quote: 'A real customer quote.', name: 'Real Person' }];
    const whyChooseUs = doc.layout.sections.find((s) => s.type === 'why-choose-us')!;
    whyChooseUs.settings.items = [{ title: 'Real benefit', description: 'Real detail' }];
    expect(runThemeHealthCheck(doc).find((f) => f.id === 'demo-content')).toBeUndefined();
  });
});
