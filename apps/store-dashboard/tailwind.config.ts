import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--cn-color-primary)',
          hover: 'var(--cn-color-primary-hover)',
          subtle: 'var(--cn-color-primary-subtle)',
          foreground: 'var(--cn-color-primary-foreground)',
        },
        admin: { sidebar: 'var(--cn-color-admin-sidebar)' },
        surface: {
          base: 'var(--cn-color-surface-base)',
          raised: 'var(--cn-color-surface-raised)',
          sunken: 'var(--cn-color-surface-sunken)',
          muted: 'var(--cn-color-surface-muted)',
        },
        ink: {
          DEFAULT: 'var(--cn-color-text-primary)',
          secondary: 'var(--cn-color-text-secondary)',
          tertiary: 'var(--cn-color-text-tertiary)',
        },
        line: {
          DEFAULT: 'var(--cn-color-border-default)',
          strong: 'var(--cn-color-border-strong)',
        },
      },
      fontFamily: { sans: ['var(--cn-font-family)'] },
      boxShadow: { soft: 'var(--cn-shadow-2)', lift: 'var(--cn-shadow-3)' },
      borderRadius: { cn: 'var(--cn-radius-md)', 'cn-lg': 'var(--cn-radius-lg)' },
    },
  },
  plugins: [],
};
export default config;
