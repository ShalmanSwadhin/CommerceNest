import { describe, expect, it } from 'vitest';
import {
  normalizeThemeDocument,
  resolveDesignSystem,
  resolveSectionBackground,
} from '@commercenest/types';

describe('normalizeThemeDocument', () => {
  it('seeds default sections from legacy flat settings', () => {
    const doc = normalizeThemeDocument({
      themeSettings: {
        primaryColor: '#112233',
        heroTitle: 'Hello',
        heroSubtitle: 'World',
        heroImageUrl: 'https://example.com/h.jpg',
        announcement: 'Sale',
      },
    });
    expect(doc.themeSettings.colors.primary).toBe('#112233');
    expect(doc.themeSettings.footer.showPoweredBy).toBe(true);
    const hero = doc.layout.sections.find((s) => s.type === 'hero');
    expect(hero?.settings.title).toBe('Hello');
    expect(hero?.settings.imageUrl).toBe('https://example.com/h.jpg');
  });

  it('preserves section order and visibility', () => {
    const doc = normalizeThemeDocument({
      layout: {
        sections: [
          {
            id: 'a',
            type: 'newsletter',
            visible: false,
            settings: { title: 'Join' },
          },
          {
            id: 'b',
            type: 'hero',
            visible: true,
            settings: { title: 'Hero' },
          },
        ],
      },
      themeSettings: {},
    });
    expect(doc.layout.sections.map((s) => s.id)).toEqual(['a', 'b']);
    expect(doc.layout.sections[0]?.visible).toBe(false);
  });

  it('forces protected Powered by CommerceNest', () => {
    const doc = normalizeThemeDocument({
      themeSettings: {
        footer: { showPoweredBy: false, description: 'x' },
      },
    });
    expect(doc.themeSettings.footer.showPoweredBy).toBe(true);
  });
});

describe('resolveSectionBackground', () => {
  it('defaults to gradient with no overlay when no image and no explicit fields are set', () => {
    const bg = resolveSectionBackground({});
    expect(bg.backgroundType).toBe('gradient');
    expect(bg.image).toBe('');
    expect(bg.position).toBe('center');
    expect(bg.overlayType).toBe('none');
    expect(bg.overlayOpacity).toBe(45);
  });

  it('infers image + dark overlay from a legacy imageUrl-only section (pre-existing themes)', () => {
    const bg = resolveSectionBackground({ imageUrl: 'https://example.com/hero.jpg', overlay: 60 });
    expect(bg.backgroundType).toBe('image');
    expect(bg.image).toBe('https://example.com/hero.jpg');
    expect(bg.overlayType).toBe('dark');
    expect(bg.position).toBe('center');
    expect(bg.overlayOpacity).toBe(60);
  });

  it('respects explicit backgroundType/overlayType/position when present', () => {
    const bg = resolveSectionBackground({
      imageUrl: 'https://example.com/hero.jpg',
      backgroundType: 'image',
      backgroundPosition: 'top',
      overlayType: 'light',
      overlayColor: '#FFFFFF',
      overlay: 20,
    });
    expect(bg.backgroundType).toBe('image');
    expect(bg.position).toBe('top');
    expect(bg.overlayType).toBe('light');
    expect(bg.overlayColor).toBe('#FFFFFF');
    expect(bg.overlayOpacity).toBe(20);
  });

  it('falls back to gradient/none when an explicit backgroundType is color with no imageUrl', () => {
    const bg = resolveSectionBackground({ backgroundType: 'color' });
    expect(bg.backgroundType).toBe('color');
    expect(bg.overlayType).toBe('none');
    expect(bg.image).toBe('');
  });

  it('ignores invalid enum values and falls back to inferred defaults', () => {
    const bg = resolveSectionBackground({
      backgroundType: 'not-a-real-type',
      backgroundPosition: 'diagonal',
      overlayType: 'rainbow',
    });
    expect(bg.backgroundType).toBe('gradient');
    expect(bg.position).toBe('center');
    expect(bg.overlayType).toBe('none');
  });

  it('respects an explicit "none" background type (no background layer at all)', () => {
    const bg = resolveSectionBackground({ backgroundType: 'none' });
    expect(bg.backgroundType).toBe('none');
    expect(bg.overlayType).toBe('none');
    expect(bg.image).toBe('');
  });
});

describe('normalizeThemeDocument — backward compatibility for newly-added section fields', () => {
  it('backfills testimonials backgroundType to "none" for a pre-existing section that never had one, instead of defaulting to a visible gradient', () => {
    const doc = normalizeThemeDocument({
      layout: {
        sections: [
          {
            id: 't1',
            type: 'testimonials',
            visible: true,
            // No backgroundType/imageUrl at all — exactly what a
            // testimonials section saved before background support existed
            // looks like.
            settings: { title: 'What customers say', items: [] },
          },
        ],
      },
      themeSettings: {},
    });
    const testimonials = doc.layout.sections.find((s) => s.type === 'testimonials');
    expect(testimonials?.settings.backgroundType).toBe('none');
    const bg = resolveSectionBackground(testimonials!.settings);
    expect(bg.backgroundType).toBe('none');
  });

  it('backfills why-choose-us imageUrl to empty string for a pre-existing section, preserving the plain card-grid layout', () => {
    const doc = normalizeThemeDocument({
      layout: {
        sections: [
          {
            id: 'w1',
            type: 'why-choose-us',
            visible: true,
            settings: { title: 'Why shop with us', items: [] },
          },
        ],
      },
      themeSettings: {},
    });
    const whyChooseUs = doc.layout.sections.find((s) => s.type === 'why-choose-us');
    expect(whyChooseUs?.settings.imageUrl).toBe('');
  });
});

describe('resolveDesignSystem (Theme Builder Pro V2 — Global Design System)', () => {
  it('defaults to the exact pre-existing hardcoded look when nothing is configured', () => {
    const ds = resolveDesignSystem({});
    expect(ds.radiusPx).toBe(12);
    expect(ds.buttonStyle).toBe('solid');
    expect(ds.shadowCss).not.toBe('none');
  });

  it('reuses the pre-existing cornerRadius setting rather than a second radius field', () => {
    const ds = resolveDesignSystem({ cornerRadius: '24' });
    expect(ds.radiusPx).toBe(24);
  });

  it('falls back to 12px when cornerRadius is not a valid number', () => {
    const ds = resolveDesignSystem({ cornerRadius: 'not-a-number' });
    expect(ds.radiusPx).toBe(12);
  });

  it('resolves shadow presets to concrete CSS, including a real "none"', () => {
    expect(resolveDesignSystem({ designSystem: { shadow: 'none' } }).shadowCss).toBe('none');
    expect(resolveDesignSystem({ designSystem: { shadow: 'strong' } }).shadowCss).toContain('40px');
  });

  it('ignores an invalid shadow/buttonStyle value and falls back to defaults', () => {
    const ds = resolveDesignSystem({
      designSystem: { shadow: 'rainbow', buttonStyle: 'chunky' },
    });
    expect(ds.buttonStyle).toBe('solid');
    expect(ds.shadowCss).toBe(resolveDesignSystem({}).shadowCss);
  });

  it('respects an explicit outline/ghost button style', () => {
    expect(resolveDesignSystem({ designSystem: { buttonStyle: 'outline' } }).buttonStyle).toBe(
      'outline',
    );
    expect(resolveDesignSystem({ designSystem: { buttonStyle: 'ghost' } }).buttonStyle).toBe(
      'ghost',
    );
  });

  it('backfills a real default designSystem for a legacy theme document with none saved', () => {
    const doc = normalizeThemeDocument({
      layout: { sections: [] },
      themeSettings: { primaryColor: '#112233' },
    });
    expect(doc.themeSettings.designSystem).toEqual({ shadow: 'subtle', buttonStyle: 'solid' });
    const ds = resolveDesignSystem(doc.themeSettings);
    expect(ds.buttonStyle).toBe('solid');
  });
});

describe('normalizeThemeDocument — typography preset resolution', () => {
  it('expands a bare preset key into real font/weight values (previously a no-op)', () => {
    const doc = normalizeThemeDocument({
      themeSettings: { typography: { preset: 'elegant' } },
    });
    expect(doc.themeSettings.typography.headingFont).toBe('Georgia');
    expect(doc.themeSettings.typography.bodyFont).toBe('Inter');
    expect(doc.themeSettings.typography.headingWeight).toBe(600);
  });

  it('gives each preset a distinct font/weight combination', () => {
    const bold = normalizeThemeDocument({ themeSettings: { typography: { preset: 'bold' } } });
    const classic = normalizeThemeDocument({
      themeSettings: { typography: { preset: 'classic' } },
    });
    expect(bold.themeSettings.typography.headingWeight).toBe(800);
    expect(classic.themeSettings.typography.headingFont).toBe('Times New Roman');
    expect(classic.themeSettings.typography.bodyFont).toBe('Georgia');
  });

  it('defaults to modern/Inter when no preset is set, unchanged from before', () => {
    const doc = normalizeThemeDocument({ themeSettings: {} });
    expect(doc.themeSettings.typography.preset).toBe('modern');
    expect(doc.themeSettings.typography.bodyFont).toBe('Inter');
    expect(doc.themeSettings.typography.headingWeight).toBe(700);
  });

  it('an explicit headingFont/bodyFont still overrides the preset default', () => {
    const doc = normalizeThemeDocument({
      themeSettings: {
        typography: { preset: 'elegant', headingFont: 'Custom Font', bodyFont: 'Custom Body' },
      },
    });
    expect(doc.themeSettings.typography.headingFont).toBe('Custom Font');
    expect(doc.themeSettings.typography.bodyFont).toBe('Custom Body');
  });

  it('falls back to invalid-preset default (modern) exactly as before', () => {
    const doc = normalizeThemeDocument({
      themeSettings: { typography: { preset: 'not-a-real-preset' } },
    });
    expect(doc.themeSettings.typography.preset).toBe('modern');
    expect(doc.themeSettings.typography.bodyFont).toBe('Inter');
  });
});
