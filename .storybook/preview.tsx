import type { Decorator, Preview } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import { ThemeProvider as NextThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { withFetch } from './decorators/with-fetch'
import '../src/app/globals.css'

/**
 * Reloj congelado: sábado 14-mar-2026, 15:30 ART (UTC-3). Elegido para que la
 * grilla muestre una tarde de sábado llena.
 *
 * Se congelan SOLO `Date.now()` y `new Date()` sin argumentos. `new Date(iso)` y
 * todos los timers quedan reales, así que:
 *   - useArtNow()/computeArtNow() devuelven un instante estable (isSlotPast en la grilla)
 *   - ExpiryCountdown renderiza siempre lo mismo
 *   - waitFor() de testing-library usa setTimeout real para su deadline, no
 *     Date.now() → los `play` no se cuelgan
 */
export const FROZEN_NOW = new Date('2026-03-14T18:30:00.000Z')

const RealDate = Date
class FrozenDate extends RealDate {
  constructor(...args: ConstructorParameters<typeof Date>) {
    super(...(args.length === 0 ? [FROZEN_NOW.getTime()] : args))
  }
  static override now(): number {
    return FROZEN_NOW.getTime()
  }
}
globalThis.Date = FrozenDate as DateConstructor

/**
 * El tema se aplica por DOS mecanismos, y los dos hacen falta:
 *
 * 1. La clase `.dark` (en <html> y en un wrapper): globals.css scopea ~300 líneas
 *    de recipes bajo `.dark` (.card-premium, .page-header-band, .player-hero-band,
 *    .reserva-*, .skeleton). Son selectores DESCENDIENTES, así que el wrapper solo
 *    alcanza — y es lo que permite que Docs mode muestre light y dark en un iframe.
 * 2. El contexto de next-themes: src/components/admin/useChartTheme.ts llama
 *    useTheme() y devuelve colores HEX para recharts, que los toma como props
 *    inline. Una clase CSS no le llega. Sin el provider, los charts quedan en
 *    tema claro aunque el resto esté oscuro.
 */
const withTheme: Decorator = (Story, ctx) => {
  const theme = (ctx.globals['theme'] as 'light' | 'dark' | undefined) ?? 'light'

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    root.lang = 'es-AR'
  }, [theme])

  return (
    <NextThemeProvider
      attribute="class"
      forcedTheme={theme}
      enableSystem={false}
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={0}>
        <div className={theme}>
          <Story />
          <Toaster />
          <ToastReaper storyId={ctx.id} />
        </div>
      </TooltipProvider>
    </NextThemeProvider>
  )
}

/**
 * src/hooks/use-toast.ts guarda los toasts en un store a nivel de módulo, así que
 * sobreviven al cambio de story. `dismiss` pide un id (no hay dismiss-all) → barrer.
 */
function ToastReaper({ storyId }: { storyId: string }) {
  const { toasts, dismiss } = useToast()
  useEffect(() => {
    toasts.forEach((t) => dismiss(t.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId])
  return null
}

/**
 * En el runner headless el reduced-motion se fuerza de verdad (browser.viewport +
 * emulateMedia). Acá es un toggle para que las stories de animación sigan siendo
 * demostrables en la UI de dev.
 */
const withMotion: Decorator = (Story, ctx) => {
  const motion = ctx.globals['motion'] as string | undefined
  useEffect(() => {
    document.documentElement.classList.toggle('sb-reduce-motion', motion === 'reduce')
  }, [motion])
  return <Story />
}

const preview: Preview = {
  decorators: [withFetch, withMotion, withTheme],

  globalTypes: {
    theme: {
      description: 'Tema (next-themes + clase .dark)',
      defaultValue: 'light',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Claro' },
          { value: 'dark', title: 'Oscuro' },
        ],
        dynamicTitle: true,
      },
    },
    motion: {
      description: 'prefers-reduced-motion',
      defaultValue: 'auto',
      toolbar: {
        icon: 'lightning',
        items: [
          { value: 'auto', title: 'Animaciones on' },
          { value: 'reduce', title: 'Reduced motion' },
        ],
        dynamicTitle: true,
      },
    },
  },

  parameters: {
    layout: 'centered',

    // App Router. Obligatorio para cualquier componente que importe next/navigation.
    // Override por story: parameters.nextjs.navigation = { pathname, query }
    nextjs: { appDirectory: true },

    controls: {
      expanded: true,
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },

    a11y: {
      // MASTER §2.4 apunta a WCAG AA. Las violaciones rompen el runner, no se avisan.
      test: 'error',
    },

    // El decorator de tema es dueño de la superficie (bg-background). Un backgrounds
    // addon encima solo taparía el token real.
    backgrounds: { disable: true },

    viewport: {
      options: {
        'mobile-small': { name: 'mobile-small', styles: { width: '360px', height: '800px' } },
        'mobile-primary': { name: 'mobile-primary', styles: { width: '393px', height: '851px' } },
        tablet: { name: 'tablet', styles: { width: '768px', height: '1024px' } },
        laptop: { name: 'laptop', styles: { width: '1366px', height: '768px' } },
        desktop: { name: 'desktop', styles: { width: '1440px', height: '900px' } },
        'desktop-large': { name: 'desktop-large', styles: { width: '1920px', height: '1080px' } },
      },
    },

    options: {
      storySort: {
        order: [
          'Design System',
          ['Tokens', 'Button', 'Badge', 'Input', 'Label'],
          'Patterns',
          'Booking',
          'Admin',
          'Player',
          'Public',
          'Onboarding',
          'Auth',
        ],
      },
    },
  },

  tags: ['autodocs'],
}

export default preview
