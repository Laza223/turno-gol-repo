import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', ...fontFamily.sans],
        display: ['var(--font-archivo)', ...fontFamily.sans],
        logo: ['var(--font-sora)', ...fontFamily.sans],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--accordion-content-height)' },
          to: { height: '0' },
        },
        'tg-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'tg-drift': {
          '0%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(3%,-2%,0)' },
          '100%': { transform: 'translate3d(0,0,0)' },
        },
        // Pulso de atención Realtime (MASTER §5.3 / pages/grilla.md §7): un
        // solo ring emerald que se disipa. box-shadow only → sin layout shift.
        'slot-pulse': {
          '0%': { boxShadow: '0 0 0 0 hsl(160 84% 39% / 0.65)' },
          '100%': { boxShadow: '0 0 0 10px hsl(160 84% 39% / 0)' },
        },
        // Entrada del cuerpo de un <details> (FAQ /precios). Los keyframes
        // accordion-* dependen de --accordion-content-height (Radix) y no
        // sirven para <details> nativo; acá se anima solo la apertura.
        'faq-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'tg-float': 'tg-float 8s ease-in-out infinite',
        'tg-drift': 'tg-drift 18s ease-in-out infinite',
        'slot-pulse': 'slot-pulse 600ms ease-out 1',
        'faq-in': 'faq-in 0.2s ease-out',
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  plugins: [require('tailwindcss-animate')],
}

export default config
