// Tailwind config for the design-sync static CSS compile. Mirrors the app's
// tailwind.config.ts theme, but scopes `content` to the synced components +
// authored previews so the emitted stylesheet carries only the classes the DS
// actually uses. Output goes to .design-sync/.cache/ds-tailwind.css (cfg.cssEntry).
const { fontFamily } = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/components/ui/**/*.{ts,tsx}',
    './.design-sync/previews/**/*.{ts,tsx}',
    './.design-sync/stubs/**/*.{ts,tsx}',
  ],
  // Rendered designs receive ONLY this stylesheet (no ambient Tailwind), so the
  // design agent's own layout/brand utilities must be present here even though no
  // synced component uses them. Safelist the documented vocabulary + a bounded set
  // of common layout/spacing/typography utilities so agent-built UIs render styled.
  safelist: [
    { pattern: /^(bg|text|border|ring|divide|fill|stroke)-(primary|secondary|destructive|success|warning|muted|accent|card|popover|background|foreground|border|input|ring)(-foreground)?$/, variants: ['hover', 'focus', 'focus-visible', 'disabled'] },
    { pattern: /^(bg|text|border|ring)-(emerald|slate|red|amber|green|gray|zinc|white)(-(50|100|200|300|400|500|600|700|800|900))?$/, variants: ['hover', 'focus-visible'] },
    { pattern: /^font-(sans|display|logo|normal|medium|semibold|bold|black)$/ },
    { pattern: /^italic$/ },
    { pattern: /^rounded(-(sm|md|lg|xl|2xl|3xl|full|none))?$/ },
    { pattern: /^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|8|10|12|16|20|24)$/ },
    { pattern: /^(w|h|min-w|min-h|max-w)-(0|2|4|6|8|10|11|12|14|16|20|24|32|40|48|56|64|72|80|96|full|screen|fit|min|max|px|xs|sm|md|lg|xl|2xl|3xl)$/ },
    { pattern: /^text-(left|center|right|xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)$/ },
    { pattern: /^(flex|grid|block|inline-block|inline-flex|hidden|relative|absolute|fixed|sticky)$/ },
    { pattern: /^(items-(start|center|end|stretch|baseline)|justify-(start|center|end|between|around|evenly)|self-(start|center|end|stretch))$/ },
    { pattern: /^(flex-(row|col|wrap|nowrap|1|auto|initial|none)|grid-cols-(1|2|3|4|5|6|12)|col-span-(1|2|3|4|6|full))$/ },
    { pattern: /^shadow(-(sm|md|lg|xl|2xl|none|inner))?$/ },
    { pattern: /^border(-(0|2|4|8|t|b|l|r|x|y|dashed|solid|dotted))?$/ },
    { pattern: /^(leading|tracking)-(none|tight|snug|normal|relaxed|loose|tighter|wide|wider|widest)$/ },
    { pattern: /^(opacity|w|h)-(0|25|50|60|70|75|80|90|100)$/ },
    { pattern: /^(overflow|overflow-x|overflow-y)-(auto|hidden|visible|scroll)$/ },
    { pattern: /^(uppercase|lowercase|capitalize|truncate|underline|line-through|tabular-nums)$/ },
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
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
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
