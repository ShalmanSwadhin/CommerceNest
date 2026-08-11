/**
 * CommerceNest design tokens — typed constants from SRS Part A.
 * Use alongside css-variables.css for runtime theming.
 */

export const colors = {
  primary: '#6C1DB3',
  primaryHover: '#5A1896',
  primarySubtle: '#F3E8FF',
  primaryForeground: '#FFFFFF',
  adminSidebar: '#0F172A',
  amberImpersonation: '#F59E0B',

  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textInverse: '#F8FAFC',
  textLink: '#6C1DB3',
  textLinkHover: '#5A1896',

  surfaceBase: '#FFFFFF',
  surfaceRaised: '#F8FAFC',
  surfaceSunken: '#F1F5F9',
  surfaceOverlay: '#FFFFFF',
  surfaceMuted: '#E2E8F0',

  borderDefault: '#E2E8F0',
  borderStrong: '#CBD5E1',
  borderInput: '#64748B',
  borderFocus: '#6C1DB3',

  status: {
    success: '#16A34A',
    successSubtle: '#DCFCE7',
    successBorder: '#86EFAC',
    caution: '#F59E0B',
    cautionSubtle: '#FEF3C7',
    cautionBorder: '#FCD34D',
    danger: '#EF4444',
    dangerSubtle: '#FEE2E2',
    dangerBorder: '#FCA5A5',
    info: '#3B82F6',
    infoSubtle: '#DBEAFE',
    infoBorder: '#93C5FD',
    neutral: '#64748B',
    neutralSubtle: '#F1F5F9',
    neutralBorder: '#CBD5E1',
  },
} as const;

export const colorsDark = {
  primary: '#6366F1',
  primaryHover: '#818CF8',
  primarySubtle: '#1E1B4B',
  primaryForeground: '#FFFFFF',
  adminSidebar: '#020617',
  amberImpersonation: '#FBBF24',

  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textTertiary: '#64748B',
  textInverse: '#0F172A',
  textLink: '#818CF8',
  textLinkHover: '#A5B4FC',

  surfaceBase: '#0F172A',
  surfaceRaised: '#1E293B',
  surfaceSunken: '#020617',
  surfaceOverlay: '#1E293B',
  surfaceMuted: '#334155',

  borderDefault: '#334155',
  borderStrong: '#475569',
  borderInput: '#94A3B8',
  borderFocus: '#6366F1',

  status: {
    success: '#22C55E',
    successSubtle: '#14532D',
    successBorder: '#166534',
    caution: '#F59E0B',
    cautionSubtle: '#451A03',
    cautionBorder: '#92400E',
    danger: '#EF4444',
    dangerSubtle: '#450A0A',
    dangerBorder: '#991B1B',
    info: '#3B82F6',
    infoSubtle: '#1E3A5F',
    infoBorder: '#1D4ED8',
    neutral: '#94A3B8',
    neutralSubtle: '#1E293B',
    neutralBorder: '#475569',
  },
} as const;

/** Spacing scale 0–20, 4px base unit */
export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  13: '52px',
  14: '56px',
  15: '60px',
  16: '64px',
  17: '68px',
  18: '72px',
  19: '76px',
  20: '80px',
} as const;

export type SpacingKey = keyof typeof spacing;

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export type RadiusKey = keyof typeof radius;

export const shadows = {
  0: 'none',
  1: '0 1px 2px 0 rgb(15 23 42 / 0.05)',
  2: '0 1px 3px 0 rgb(15 23 42 / 0.1), 0 1px 2px -1px rgb(15 23 42 / 0.1)',
  3: '0 4px 6px -1px rgb(15 23 42 / 0.1), 0 2px 4px -2px rgb(15 23 42 / 0.1)',
  4: '0 10px 15px -3px rgb(15 23 42 / 0.1), 0 4px 6px -4px rgb(15 23 42 / 0.1)',
} as const;

export type ShadowKey = keyof typeof shadows;

export const motion = {
  durationInstant: '0ms',
  durationFast: '100ms',
  durationNormal: '200ms',
  durationSlow: '300ms',
  durationSlower: '500ms',
  easingDefault: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easingIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easingOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easingInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export type MotionDurationKey =
  | 'durationInstant'
  | 'durationFast'
  | 'durationNormal'
  | 'durationSlow'
  | 'durationSlower';

export const typography = {
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.625',
  },
} as const;

export const focusRing = {
  width: '2px',
  offset: '2px',
  color: colors.primary,
} as const;

export const tokens = {
  colors,
  colorsDark,
  spacing,
  radius,
  shadows,
  motion,
  typography,
  focusRing,
} as const;

export type Colors = typeof colors;
export type StatusTone = 'success' | 'caution' | 'danger' | 'info' | 'neutral';
export type Tokens = typeof tokens;
