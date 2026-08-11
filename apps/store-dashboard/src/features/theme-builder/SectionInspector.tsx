import {
  COLOR_PRESETS,
  DEFAULT_SECTION_DEFS,
  TYPOGRAPHY_PRESETS,
  type ThemeDocument,
  type ThemeSection,
} from '@commercenest/types/schemas/theme';
import { Button, FormField, Input, Textarea } from '@commercenest/ui';
import { MediaImageField } from './MediaImageField';

type InspectorTab = 'section' | 'branding' | 'colors' | 'typography' | 'header' | 'footer';

type SectionInspectorProps = {
  storeId: string;
  tab: InspectorTab;
  doc: ThemeDocument;
  section: ThemeSection | null;
  onTabChange: (tab: InspectorTab) => void;
  onDocChange: (doc: ThemeDocument) => void;
  onSectionChange: (section: ThemeSection) => void;
};

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-ink-secondary">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-[96px] font-mono text-xs"
        />
      </span>
    </label>
  );
}

export function SectionInspector({
  storeId,
  tab,
  doc,
  section,
  onTabChange,
  onDocChange,
  onSectionChange,
}: SectionInspectorProps) {
  const settings = doc.themeSettings;
  const patchSettings = (partial: Partial<ThemeDocument['themeSettings']>) => {
    const next = { ...settings, ...partial };
    // Keep legacy mirrors in sync
    if (partial.colors) {
      next.primaryColor = partial.colors.primary;
      next.secondaryColor = partial.colors.secondary;
      next.accentColor = partial.colors.accent;
    }
    if (partial.typography) {
      next.fontFamily = partial.typography.bodyFont;
    }
    if (partial.branding) {
      next.logoUrl = partial.branding.logoUrl;
      next.faviconUrl = partial.branding.faviconUrl;
      next.announcement = partial.branding.announcement;
    }
    if (partial.header) {
      next.headerStyle = partial.header.style;
    }
    if (partial.footer) {
      next.footerText = partial.footer.description;
    }
    onDocChange({ ...doc, themeSettings: next });
  };

  const patchSectionSetting = (key: string, value: unknown) => {
    if (!section) return;
    onSectionChange({
      ...section,
      settings: { ...section.settings, [key]: value },
    });
  };

  const tabs: { id: InspectorTab; label: string }[] = [
    { id: 'section', label: 'Section' },
    { id: 'branding', label: 'Brand' },
    { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Type' },
    { id: 'header', label: 'Header' },
    { id: 'footer', label: 'Footer' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-0.5 overflow-x-auto border-b border-line px-2 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              tab === t.id
                ? 'bg-brand text-white'
                : 'text-ink-secondary hover:bg-surface-raised'
            }`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {tab === 'section' && !section && (
          <p className="text-sm text-ink-secondary">
            Select a homepage section from the left panel to edit its settings.
          </p>
        )}

        {tab === 'section' && section && (
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">
                {DEFAULT_SECTION_DEFS.find((d) => d.type === section.type)?.label ||
                  section.type}
              </p>
              <p className="mt-1 text-xs text-ink-secondary">
                Changes update the live preview instantly. Save Draft to persist.
              </p>
            </div>

            {section.type === 'hero' && (
              <div className="space-y-3">
                <FormField label="Layout">
                  <select
                    className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm"
                    value={String(section.settings.layout || 'content-left')}
                    onChange={(e) => patchSectionSetting('layout', e.target.value)}
                  >
                    <option value="content-left">Content left</option>
                    <option value="centered">Centered</option>
                    <option value="full-bleed">Full-width image</option>
                  </select>
                </FormField>
                <FormField label="Badge">
                  <Input
                    value={String(section.settings.badge || '')}
                    onChange={(e) => patchSectionSetting('badge', e.target.value)}
                  />
                </FormField>
                <FormField label="Title">
                  <Input
                    value={String(section.settings.title || '')}
                    onChange={(e) => patchSectionSetting('title', e.target.value)}
                  />
                </FormField>
                <FormField label="Subtitle">
                  <Textarea
                    value={String(section.settings.subtitle || '')}
                    onChange={(e) => patchSectionSetting('subtitle', e.target.value)}
                    rows={3}
                  />
                </FormField>
                <FormField label="Primary CTA">
                  <Input
                    value={String(section.settings.primaryCtaLabel || '')}
                    onChange={(e) =>
                      patchSectionSetting('primaryCtaLabel', e.target.value)
                    }
                  />
                </FormField>
                <FormField label="Primary CTA link">
                  <Input
                    value={String(section.settings.primaryCtaHref || '')}
                    onChange={(e) =>
                      patchSectionSetting('primaryCtaHref', e.target.value)
                    }
                  />
                </FormField>
                <FormField label="Secondary CTA">
                  <Input
                    value={String(section.settings.secondaryCtaLabel || '')}
                    onChange={(e) =>
                      patchSectionSetting('secondaryCtaLabel', e.target.value)
                    }
                  />
                </FormField>
                <MediaImageField
                  storeId={storeId}
                  label="Hero image"
                  value={String(section.settings.imageUrl || '')}
                  usageType="STORE_BANNER"
                  onChange={(url) => patchSectionSetting('imageUrl', url)}
                />
                <FormField label={`Overlay ${Number(section.settings.overlay || 45)}%`}>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={Number(section.settings.overlay || 45)}
                    onChange={(e) =>
                      patchSectionSetting('overlay', Number(e.target.value))
                    }
                    className="w-full"
                  />
                </FormField>
                <FormField label="Height">
                  <select
                    className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm"
                    value={String(section.settings.height || 'lg')}
                    onChange={(e) => patchSectionSetting('height', e.target.value)}
                  >
                    <option value="sm">Compact</option>
                    <option value="md">Medium</option>
                    <option value="lg">Tall</option>
                  </select>
                </FormField>
              </div>
            )}

            {(section.type === 'featured-products' ||
              section.type === 'best-sellers' ||
              section.type === 'featured-categories') && (
              <div className="space-y-3">
                <FormField label="Section title">
                  <Input
                    value={String(section.settings.title || '')}
                    onChange={(e) => patchSectionSetting('title', e.target.value)}
                  />
                </FormField>
                <FormField label="Subtitle">
                  <Input
                    value={String(section.settings.subtitle || '')}
                    onChange={(e) => patchSectionSetting('subtitle', e.target.value)}
                  />
                </FormField>
                <FormField label="Item limit">
                  <Input
                    type="number"
                    min={2}
                    max={24}
                    value={Number(section.settings.limit || 8)}
                    onChange={(e) =>
                      patchSectionSetting('limit', Number(e.target.value))
                    }
                  />
                </FormField>
                {section.type !== 'featured-categories' && (
                  <FormField label="Columns">
                    <select
                      className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm"
                      value={Number(section.settings.columns || 4)}
                      onChange={(e) =>
                        patchSectionSetting('columns', Number(e.target.value))
                      }
                    >
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                    </select>
                  </FormField>
                )}
              </div>
            )}

            {section.type === 'promo-banner' && (
              <div className="space-y-3">
                <FormField label="Heading">
                  <Input
                    value={String(section.settings.heading || '')}
                    onChange={(e) => patchSectionSetting('heading', e.target.value)}
                  />
                </FormField>
                <FormField label="Description">
                  <Textarea
                    value={String(section.settings.description || '')}
                    onChange={(e) =>
                      patchSectionSetting('description', e.target.value)
                    }
                    rows={3}
                  />
                </FormField>
                <FormField label="CTA label">
                  <Input
                    value={String(section.settings.ctaLabel || '')}
                    onChange={(e) => patchSectionSetting('ctaLabel', e.target.value)}
                  />
                </FormField>
                <MediaImageField
                  storeId={storeId}
                  label="Banner image"
                  value={String(section.settings.imageUrl || '')}
                  usageType="STORE_BANNER"
                  onChange={(url) => patchSectionSetting('imageUrl', url)}
                />
              </div>
            )}

            {(section.type === 'newsletter' ||
              section.type === 'why-choose-us' ||
              section.type === 'testimonials') && (
              <div className="space-y-3">
                <FormField label="Title">
                  <Input
                    value={String(section.settings.title || '')}
                    onChange={(e) => patchSectionSetting('title', e.target.value)}
                  />
                </FormField>
                {section.type === 'newsletter' && (
                  <>
                    <FormField label="Subtitle">
                      <Textarea
                        value={String(section.settings.subtitle || '')}
                        onChange={(e) =>
                          patchSectionSetting('subtitle', e.target.value)
                        }
                        rows={2}
                      />
                    </FormField>
                    <FormField label="Button text">
                      <Input
                        value={String(section.settings.buttonText || '')}
                        onChange={(e) =>
                          patchSectionSetting('buttonText', e.target.value)
                        }
                      />
                    </FormField>
                  </>
                )}
                {section.type === 'testimonials' && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Quotes are sample/demo content for layout preview — not real
                    customer reviews.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'branding' && (
          <div className="space-y-4">
            <MediaImageField
              storeId={storeId}
              label="Store logo"
              value={settings.branding.logoUrl}
              usageType="STORE_LOGO"
              onChange={(logoUrl) =>
                patchSettings({ branding: { ...settings.branding, logoUrl } })
              }
            />
            <MediaImageField
              storeId={storeId}
              label="Favicon"
              value={settings.branding.faviconUrl}
              usageType="OTHER"
              onChange={(faviconUrl) =>
                patchSettings({ branding: { ...settings.branding, faviconUrl } })
              }
            />
            <FormField label="Announcement bar">
              <Input
                value={settings.branding.announcement}
                onChange={(e) =>
                  patchSettings({
                    branding: { ...settings.branding, announcement: e.target.value },
                  })
                }
                placeholder="Free delivery this week"
              />
            </FormField>
            <FormField label="Tagline">
              <Input
                value={settings.branding.tagline}
                onChange={(e) =>
                  patchSettings({
                    branding: { ...settings.branding, tagline: e.target.value },
                  })
                }
              />
            </FormField>
          </div>
        )}

        {tab === 'colors' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                <Button
                  key={key}
                  size="sm"
                  variant="secondary"
                  type="button"
                  onClick={() =>
                    patchSettings({
                      colors: { ...settings.colors, ...preset },
                    })
                  }
                >
                  {key}
                </Button>
              ))}
            </div>
            {(
              [
                ['primary', 'Primary'],
                ['secondary', 'Secondary'],
                ['accent', 'Accent'],
                ['background', 'Background'],
                ['surface', 'Surface'],
                ['text', 'Text'],
                ['mutedText', 'Muted text'],
                ['border', 'Border'],
              ] as const
            ).map(([key, label]) => (
              <ColorRow
                key={key}
                label={label}
                value={settings.colors[key]}
                onChange={(v) =>
                  patchSettings({ colors: { ...settings.colors, [key]: v } })
                }
              />
            ))}
            <FormField label="Corner radius (px)">
              <Input
                value={String(settings.cornerRadius)}
                onChange={(e) =>
                  patchSettings({ cornerRadius: e.target.value })
                }
              />
            </FormField>
          </div>
        )}

        {tab === 'typography' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(TYPOGRAPHY_PRESETS).map(([key, preset]) => (
                <Button
                  key={key}
                  size="sm"
                  variant="secondary"
                  type="button"
                  onClick={() =>
                    patchSettings({
                      typography: { ...settings.typography, ...preset },
                    })
                  }
                >
                  {key}
                </Button>
              ))}
            </div>
            <FormField label="Heading font">
              <Input
                value={settings.typography.headingFont}
                onChange={(e) =>
                  patchSettings({
                    typography: {
                      ...settings.typography,
                      headingFont: e.target.value,
                    },
                  })
                }
              />
            </FormField>
            <FormField label="Body font">
              <Input
                value={settings.typography.bodyFont}
                onChange={(e) =>
                  patchSettings({
                    typography: {
                      ...settings.typography,
                      bodyFont: e.target.value,
                    },
                  })
                }
              />
            </FormField>
            <div
              className="rounded-xl border border-line p-4"
              style={{ fontFamily: settings.typography.bodyFont }}
            >
              <p
                className="text-2xl"
                style={{
                  fontFamily: settings.typography.headingFont,
                  fontWeight: settings.typography.headingWeight,
                }}
              >
                Aa CommerceNest
              </p>
              <p className="mt-1 text-sm text-ink-secondary">Build. Grow. Scale.</p>
            </div>
          </div>
        )}

        {tab === 'header' && (
          <div className="space-y-3">
            <FormField label="Header style">
              <select
                className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm"
                value={settings.header.style}
                onChange={(e) =>
                  patchSettings({
                    header: {
                      ...settings.header,
                      style: e.target.value as 'solid' | 'minimal' | 'centered',
                    },
                  })
                }
              >
                <option value="solid">Standard</option>
                <option value="centered">Centered</option>
                <option value="minimal">Minimal</option>
              </select>
            </FormField>
            {(
              [
                ['sticky', 'Sticky header'],
                ['showSearch', 'Show search'],
                ['showCart', 'Show cart'],
                ['showAccount', 'Show account'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(settings.header[key])}
                  onChange={(e) =>
                    patchSettings({
                      header: { ...settings.header, [key]: e.target.checked },
                    })
                  }
                />
              </label>
            ))}
          </div>
        )}

        {tab === 'footer' && (
          <div className="space-y-3">
            <FormField label="Footer description">
              <Textarea
                value={settings.footer.description}
                onChange={(e) =>
                  patchSettings({
                    footer: { ...settings.footer, description: e.target.value },
                  })
                }
                rows={3}
              />
            </FormField>
            <FormField label="Copyright text">
              <Input
                value={settings.footer.copyrightText}
                onChange={(e) =>
                  patchSettings({
                    footer: {
                      ...settings.footer,
                      copyrightText: e.target.value,
                    },
                  })
                }
              />
            </FormField>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              “Powered by CommerceNest” attribution stays visible for platform
              identity. Merchants cannot remove it.
            </div>
            <label className="flex items-center justify-between text-sm opacity-60">
              <span>Show Powered by CommerceNest</span>
              <input type="checkbox" checked disabled readOnly />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

export type { InspectorTab };
