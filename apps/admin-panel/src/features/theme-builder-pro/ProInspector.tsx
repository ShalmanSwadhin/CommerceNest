import { useState } from 'react';
import {
  DEFAULT_SECTION_DEFS,
  resolveSectionBackground,
  type ThemeSection,
  type ThemeSectionType,
} from '@commercenest/types/schemas/theme';
import { FormField } from '@commercenest/ui';
import { MediaImageField } from '../theme-builder/MediaImageField';
import {
  SPACING_VALUES,
  type ResponsiveDevice,
  type SpacingValue,
  getResponsiveOverride,
} from './sectionOps';

type FieldKind = 'text' | 'textarea' | 'url';
type ContentField = { key: string; label: string; kind: FieldKind };

/**
 * Data-driven content fields per section type — deliberately a small,
 * curated set of the safe, universally-understood properties (matching V1
 * spec §13's "clean and understandable editing experience, not hundreds of
 * settings"). Array/item content (why-choose-us bullets, testimonial
 * quotes) is intentionally out of scope for V1 and left to the Standard
 * Builder's existing item editor — both write the same document, so nothing
 * done there is lost when reopening in Pro.
 */
const CONTENT_FIELDS: Record<ThemeSectionType, ContentField[]> = {
  hero: [
    { key: 'badge', label: 'Badge', kind: 'text' },
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'subtitle', label: 'Subtitle', kind: 'textarea' },
    { key: 'primaryCtaLabel', label: 'Primary button label', kind: 'text' },
    { key: 'primaryCtaHref', label: 'Primary button link', kind: 'url' },
    { key: 'secondaryCtaLabel', label: 'Secondary button label', kind: 'text' },
    { key: 'secondaryCtaHref', label: 'Secondary button link', kind: 'url' },
  ],
  'featured-categories': [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'subtitle', label: 'Subtitle', kind: 'text' },
  ],
  'featured-products': [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'subtitle', label: 'Subtitle', kind: 'text' },
  ],
  'promo-banner': [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'ctaLabel', label: 'Button label', kind: 'text' },
    { key: 'ctaHref', label: 'Button link', kind: 'url' },
  ],
  'best-sellers': [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'subtitle', label: 'Subtitle', kind: 'text' },
  ],
  'why-choose-us': [{ key: 'title', label: 'Title', kind: 'text' }],
  testimonials: [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'caption', label: 'Caption', kind: 'text' },
  ],
  newsletter: [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'subtitle', label: 'Subtitle', kind: 'textarea' },
    { key: 'buttonText', label: 'Button label', kind: 'text' },
  ],
};

const IMAGE_FIELD_TYPES: ThemeSectionType[] = ['hero', 'promo-banner', 'why-choose-us'];
const BACKGROUND_TYPES_WITH_STYLE: ThemeSectionType[] = ['hero', 'promo-banner', 'testimonials'];

const LABELS = Object.fromEntries(DEFAULT_SECTION_DEFS.map((d) => [d.type, d.label])) as Record<
  ThemeSectionType,
  string
>;

type InspectorTab = 'content' | 'layout' | 'style' | 'responsive';

type ProInspectorProps = {
  storeId: string;
  section: ThemeSection | null;
  onPatch: (patch: Record<string, unknown>) => void;
  onResponsivePatch: (device: ResponsiveDevice, patch: { hidden?: boolean; spacing?: SpacingValue }) => void;
};

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'content', label: 'Content' },
  { id: 'layout', label: 'Layout' },
  { id: 'style', label: 'Style' },
  { id: 'responsive', label: 'Responsive' },
];

export function ProInspector({ storeId, section, onPatch, onResponsivePatch }: ProInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('content');
  const [device, setDevice] = useState<ResponsiveDevice>('tablet');

  if (!section) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-tertiary">
        Select a section on the canvas or in the layers panel to edit it.
      </div>
    );
  }

  const fields = CONTENT_FIELDS[section.type] || [];
  const showImageField = IMAGE_FIELD_TYPES.includes(section.type);
  const showStyle = BACKGROUND_TYPES_WITH_STYLE.includes(section.type);
  const spacing = SPACING_VALUES.includes(section.settings.spacing as SpacingValue)
    ? (section.settings.spacing as SpacingValue)
    : 'md';
  const override = getResponsiveOverride(section, device);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">
          {LABELS[section.type] || section.type}
        </p>
      </div>
      <div className="flex gap-1 border-b border-line p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-primary text-white' : 'text-ink-secondary hover:bg-surface-raised'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {tab === 'content' ? (
          <>
            {fields.map((field) => (
              <FormField key={field.key} label={field.label}>
                {field.kind === 'textarea' ? (
                  <textarea
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                    rows={3}
                    value={String(section.settings[field.key] ?? '')}
                    onChange={(e) => onPatch({ [field.key]: e.target.value })}
                  />
                ) : (
                  <input
                    type="text"
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                    value={String(section.settings[field.key] ?? '')}
                    onChange={(e) => onPatch({ [field.key]: e.target.value })}
                  />
                )}
              </FormField>
            ))}
            {showImageField ? (
              <MediaImageField
                storeId={storeId}
                label="Image"
                value={String(section.settings.imageUrl || '')}
                onChange={(url) => onPatch({ imageUrl: url })}
                usageType="STORE_BANNER"
              />
            ) : null}
            {section.type === 'why-choose-us' ? (
              <>
                <FormField label="Image position">
                  <select
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                    value={String(section.settings.imagePosition || 'right')}
                    onChange={(e) => onPatch({ imagePosition: e.target.value })}
                  >
                    <option value="right">Image on right</option>
                    <option value="left">Image on left</option>
                  </select>
                </FormField>
                <p className="rounded-lg bg-surface-raised px-3 py-2 text-xs text-ink-tertiary">
                  The checklist items themselves are edited in the Standard Theme Builder&apos;s
                  item editor — changes there appear here too, since both editors share the same
                  draft.
                </p>
              </>
            ) : null}
            {section.type === 'testimonials' ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Quotes are sample/demo content for layout preview, not real customer reviews.
                Edit individual quotes in the Standard Theme Builder&apos;s item editor.
              </p>
            ) : null}
          </>
        ) : null}

        {tab === 'layout' ? (
          <>
            <FormField label="Section spacing (desktop)">
              <div className="grid grid-cols-4 gap-1.5">
                {SPACING_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onPatch({ spacing: value })}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-semibold uppercase ${
                      spacing === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-line text-ink-secondary hover:bg-surface-raised'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </FormField>
            <p className="text-xs text-ink-tertiary">
              Toggle this section&apos;s visibility from the layers panel (the eye icon).
            </p>
          </>
        ) : null}

        {tab === 'style' ? (
          showStyle ? (
            <BackgroundStyleFields section={section} onPatch={onPatch} />
          ) : (
            <p className="text-xs text-ink-tertiary">
              This section type doesn&apos;t have background/style controls yet.
            </p>
          )
        ) : null}

        {tab === 'responsive' ? (
          <>
            <div className="flex gap-1">
              {(['tablet', 'mobile'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  aria-pressed={device === d}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize ${
                    device === d ? 'bg-primary text-white' : 'text-ink-secondary hover:bg-surface-raised'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <FormField label={`Spacing override (${device})`}>
              <div className="grid grid-cols-4 gap-1.5">
                {SPACING_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onResponsivePatch(device, { spacing: value })}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-semibold uppercase ${
                      (override.spacing || spacing) === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-line text-ink-secondary hover:bg-surface-raised'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </FormField>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={override.hidden === true}
                onChange={(e) => onResponsivePatch(device, { hidden: e.target.checked })}
              />
              Hide this section on {device}
            </label>
            <p className="text-xs text-ink-tertiary">
              Switch the toolbar to Tablet or Mobile to see &quot;Hide on this device&quot; reflected
              immediately in the canvas. These overrides are saved with the section; the live
              storefront doesn&apos;t read them yet — that&apos;s foundation for a future update.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function BackgroundStyleFields({
  section,
  onPatch,
}: {
  section: ThemeSection;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const bg = resolveSectionBackground(section.settings);
  const options: { value: 'none' | 'color' | 'gradient' | 'image'; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'gradient', label: 'Gradient' },
    { value: 'color', label: 'Color' },
    { value: 'image', label: 'Image' },
  ];
  return (
    <FormField label="Background">
      <div className="grid grid-cols-4 gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onPatch({ backgroundType: opt.value })}
            className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
              bg.backgroundType === opt.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-line text-ink-secondary hover:bg-surface-raised'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </FormField>
  );
}
