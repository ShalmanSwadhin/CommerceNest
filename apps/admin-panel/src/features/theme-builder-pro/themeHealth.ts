import {
  DEFAULT_SECTION_DEFS,
  type ThemeDocument,
  type ThemeSection,
} from '@commercenest/types/schemas/theme';

/**
 * Theme Builder Pro V3/V4 — "Theme Health". Real, deterministic static
 * analysis of the actual theme document: WCAG contrast math and structural
 * checks. Deliberately NOT a fabricated single score ("94/100") — the V4
 * spec itself calls for this to be "diagnostic, not marketing fluff", so
 * findings are a plain pass/warn checklist with a genuine reason attached
 * to each one, computed from data that actually exists.
 */
export type HealthSeverity = 'pass' | 'warn';

export type HealthFinding = {
  id: string;
  severity: HealthSeverity;
  title: string;
  detail: string;
};

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Real WCAG 2 contrast ratio (1–21) between two hex colors. Returns null if either color is unparsable. */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return null;
  const lA = relativeLuminance(rgbA);
  const lB = relativeLuminance(rgbB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_NORMAL_TEXT = 4.5;

function checkContrast(doc: ThemeDocument): HealthFinding[] {
  const { colors } = doc.themeSettings;
  const findings: HealthFinding[] = [];

  const bodyRatio = contrastRatio(colors.text, colors.background);
  if (bodyRatio !== null) {
    findings.push(
      bodyRatio >= WCAG_AA_NORMAL_TEXT
        ? {
            id: 'contrast-body',
            severity: 'pass',
            title: 'Body text contrast',
            detail: `Text on background is ${bodyRatio.toFixed(2)}:1 — meets WCAG AA (4.5:1).`,
          }
        : {
            id: 'contrast-body',
            severity: 'warn',
            title: 'Body text contrast may be too low',
            detail: `Text on background is only ${bodyRatio.toFixed(2)}:1 — WCAG AA requires 4.5:1 for normal text. Consider a darker text color or lighter background.`,
          },
    );
  }

  const buttonRatio = contrastRatio('#FFFFFF', colors.primary);
  if (buttonRatio !== null) {
    findings.push(
      buttonRatio >= 3
        ? {
            id: 'contrast-button',
            severity: 'pass',
            title: 'Primary button contrast',
            detail: `White text on your primary color is ${buttonRatio.toFixed(2)}:1.`,
          }
        : {
            id: 'contrast-button',
            severity: 'warn',
            title: 'Primary color may be too light for white button text',
            detail: `White text on your primary color is only ${buttonRatio.toFixed(2)}:1 — hard to read. Consider a darker primary color.`,
          },
    );
  }

  return findings;
}

const LARGE_THEME_THRESHOLD = 30;

function isUneditedDemoContent(section: ThemeSection): boolean {
  const def = DEFAULT_SECTION_DEFS.find((d) => d.type === section.type);
  if (!def || !('items' in def.defaultSettings)) return false;
  return JSON.stringify(section.settings.items) === JSON.stringify(def.defaultSettings.items);
}

function checkStructure(doc: ThemeDocument): HealthFinding[] {
  const { sections } = doc.layout;
  const findings: HealthFinding[] = [];
  const visibleCount = sections.filter((s) => s.visible).length;

  findings.push(
    sections.length > LARGE_THEME_THRESHOLD
      ? {
          id: 'section-count',
          severity: 'warn',
          title: 'This is a large theme',
          detail: `${sections.length} sections. Editor and page-load performance can degrade past ~${LARGE_THEME_THRESHOLD}. Consider removing unused sections.`,
        }
      : {
          id: 'section-count',
          severity: 'pass',
          title: 'Section count',
          detail: `${sections.length} sections (${visibleCount} visible) — within normal range.`,
        },
  );

  const emptySections = sections.filter((s) => {
    if (!s.visible) return false;
    const title = String(s.settings.title || s.settings.heading || '');
    const hasImage = Boolean(s.settings.imageUrl);
    return !title.trim() && !hasImage;
  });
  findings.push(
    emptySections.length > 0
      ? {
          id: 'empty-sections',
          severity: 'warn',
          title: 'Some sections have no title or image',
          detail: `${emptySections.length} visible section(s) (${emptySections.map((s) => s.type).join(', ')}) have neither a title nor an image — customers will see a blank-looking block.`,
        }
      : {
          id: 'empty-sections',
          severity: 'pass',
          title: 'All visible sections have content',
          detail: 'No visible section is missing both a title and an image.',
        },
  );

  const duplicateAdjacent: string[] = [];
  for (let i = 1; i < sections.length; i++) {
    if (sections[i]!.type === sections[i - 1]!.type) {
      duplicateAdjacent.push(sections[i]!.type);
    }
  }
  if (duplicateAdjacent.length > 0) {
    findings.push({
      id: 'duplicate-adjacent',
      severity: 'warn',
      title: 'Two of the same section type are next to each other',
      detail: `${duplicateAdjacent.join(', ')} — this may be intentional, but double-check it's not an accidental duplicate.`,
    });
  }

  const demoSections = sections.filter((s) => s.visible && isUneditedDemoContent(s));
  if (demoSections.length > 0) {
    findings.push({
      id: 'demo-content',
      severity: 'warn',
      title: 'Sample/demo content is still in place',
      detail: `${demoSections.map((s) => s.type).join(', ')} still ${demoSections.length === 1 ? 'has' : 'have'} the original placeholder items — replace before publishing to customers.`,
    });
  }

  return findings;
}

export function runThemeHealthCheck(doc: ThemeDocument): HealthFinding[] {
  return [...checkContrast(doc), ...checkStructure(doc)];
}
