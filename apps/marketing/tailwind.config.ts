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
        brand: {
          DEFAULT: '#6C1DB3',
          soft: '#7C3AED',
          bright: '#8B5CF6',
          pink: '#A855F7',
        },
        navy: {
          DEFAULT: '#050816',
          raised: '#0B1023',
          panel: '#111827',
        },
        mist: {
          DEFAULT: '#F8F7FC',
          white: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#111827',
          secondary: '#374151',
          muted: '#6B7280',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        glow: '0 0 60px rgba(108, 29, 179, 0.45)',
        'glow-sm': '0 0 28px rgba(108, 29, 179, 0.35)',
        card: '0 8px 30px rgba(15, 23, 42, 0.06)',
        lift: '0 16px 40px rgba(15, 23, 42, 0.12)',
        phone: '0 25px 50px rgba(0, 0, 0, 0.45)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6C1DB3 0%, #8B5CF6 100%)',
        'hero-radial':
          'radial-gradient(ellipse 80% 60% at 70% 40%, rgba(108, 29, 179, 0.35), transparent 60%)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0) rotate(-1deg)' },
          '50%': { transform: 'translateY(-8px) rotate(1deg)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float-slow 7s ease-in-out infinite',
        'fade-up': 'fade-up 0.6s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
