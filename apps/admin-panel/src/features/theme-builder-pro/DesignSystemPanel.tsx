import { resolveDesignSystem, type ThemeDocument } from '@commercenest/types/schemas/theme';
import { Button, Modal } from '@commercenest/ui';

const RADIUS_PRESETS = [
  { value: 0, label: 'None' },
  { value: 6, label: 'Small' },
  { value: 12, label: 'Medium' },
  { value: 20, label: 'Large' },
  { value: 28, label: 'XL' },
];

const SHADOW_PRESETS: { value: 'none' | 'subtle' | 'medium' | 'strong'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
];

const BUTTON_STYLE_PRESETS: { value: 'solid' | 'outline' | 'ghost'; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'outline', label: 'Outline' },
  { value: 'ghost', label: 'Ghost' },
];

const TEMPLATE_PRESETS: { value: 'default' | 'modern-commerce'; label: string; description: string }[] = [
  { value: 'default', label: 'Standard', description: 'The regular CommerceNest storefront — works with every section type and every merchant.' },
  {
    value: 'modern-commerce',
    label: 'Modern Commerce',
    description: 'A dedicated premium storefront experience — its own header, cart drawer, search overlay, and product cards. Best paired with the "Premium Modern" prebuilt layout.',
  },
];

type DesignSystemPanelProps = {
  open: boolean;
  onClose: () => void;
  themeSettings: ThemeDocument['themeSettings'];
  onPatch: (patch: Record<string, unknown>) => void;
};

/**
 * Theme Builder Pro V2 — Global Design System. Configures store-wide tokens
 * (radius/shadow/button style) that apply everywhere at once — the storefront
 * (via `--store-radius`/`--store-shadow` CSS custom properties + the
 * `buttonStyle` token) and this same canvas — rather than per-section
 * settings. `radius` reuses the pre-existing `cornerRadius` field (it has
 * been editable since before Pro existed, but had no visual effect anywhere
 * until this feature wired it up); `shadow`/`buttonStyle` are new.
 */
export function DesignSystemPanel({ open, onClose, themeSettings, onPatch }: DesignSystemPanelProps) {
  const resolved = resolveDesignSystem(themeSettings);
  const designSystem = (themeSettings.designSystem || {}) as { shadow?: string; buttonStyle?: string };

  function patchDesignSystem(patch: Record<string, unknown>) {
    onPatch({ designSystem: { ...designSystem, ...patch } });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Design system"
      description="Global tokens that apply to every section at once — cards, banners, and buttons across the whole storefront."
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Storefront template</p>
          <p className="mb-2 text-xs text-ink-secondary">
            Changes which set of components renders the storefront — not just colors. Switching back to
            Standard is always safe; nothing about the merchant's products, orders, or other settings changes.
          </p>
          <div className="space-y-1.5">
            {TEMPLATE_PRESETS.map((preset) => {
              const active = (themeSettings.templateId || 'default') === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onPatch({ templateId: preset.value })}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    active ? 'border-primary bg-primary/10' : 'border-line hover:bg-surface-raised'
                  }`}
                >
                  <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-ink'}`}>
                    {preset.label}
                  </span>
                  <span className="block text-xs text-ink-secondary">{preset.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Corner radius</p>
          <div className="grid grid-cols-5 gap-1.5">
            {RADIUS_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onPatch({ cornerRadius: String(preset.value) })}
                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                  resolved.radiusPx === preset.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-line text-ink-secondary hover:bg-surface-raised'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Shadow</p>
          <div className="grid grid-cols-4 gap-1.5">
            {SHADOW_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => patchDesignSystem({ shadow: preset.value })}
                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                  (designSystem.shadow || 'subtle') === preset.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-line text-ink-secondary hover:bg-surface-raised'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Button style</p>
          <div className="grid grid-cols-3 gap-1.5">
            {BUTTON_STYLE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => patchDesignSystem({ buttonStyle: preset.value })}
                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                  (designSystem.buttonStyle || 'solid') === preset.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-line text-ink-secondary hover:bg-surface-raised'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Preview</p>
          <div
            className="flex items-center justify-between gap-4 bg-[#0B1023] p-6"
            style={{ borderRadius: resolved.radiusPx }}
          >
            <div
              className="h-16 w-16 shrink-0 bg-white/20"
              style={{ borderRadius: resolved.radiusPx, boxShadow: resolved.shadowCss }}
            />
            <span
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${
                resolved.buttonStyle === 'outline'
                  ? 'border border-white/70 bg-transparent text-white'
                  : resolved.buttonStyle === 'ghost'
                    ? 'bg-transparent text-white underline'
                    : 'bg-white text-slate-900'
              }`}
            >
              Shop Now
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
