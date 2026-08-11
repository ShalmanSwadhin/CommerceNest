import { describe, expect, it } from 'vitest';
import { normalizeThemeDocument } from '@commercenest/types';

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
