import { useEffect } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import Reveal from './Reveal'

const ORIGINAL_MATCH_MEDIA = typeof window !== 'undefined' ? window.matchMedia : undefined

/**
 * `Reveal` decide su estado inicial de forma SÍNCRONA en un efecto que corre
 * apenas monta (IntersectionObserver + matchMedia), antes de que un `play`
 * pueda intervenir. Por eso el mock de `matchMedia` se aplica durante el
 * RENDER del decorator (no en un efecto): los efectos de React corren de
 * adentro hacia afuera, así que si lo hiciera en un `useEffect` del wrapper
 * correría DESPUÉS del efecto de `Reveal`, demasiado tarde.
 */
const ReducedMotionDecorator: Decorator = (Story, ctx) => {
  const reduced = ctx.parameters['reducedMotion'] === true
  if (reduced && typeof window !== 'undefined') {
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList) as typeof window.matchMedia
  }
  useEffect(
    () => () => {
      if (reduced && ORIGINAL_MATCH_MEDIA) window.matchMedia = ORIGINAL_MATCH_MEDIA
    },
    [reduced],
  )
  return <Story />
}

const meta = {
  title: 'Design System/Reveal',
  component: Reveal,
  parameters: { layout: 'padded' },
  decorators: [ReducedMotionDecorator],
  args: {
    children: (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        Contenido revelado
      </div>
    ),
  },
} satisfies Meta<typeof Reveal>

export default meta
type Story = StoryObj<typeof meta>

/** Dentro del viewport del canvas: el IntersectionObserver dispara casi de
 * inmediato y el contenido termina visible (fade-up completo). */
export const Visible: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const el = canvas.getByText('Contenido revelado').parentElement!
    await waitFor(() => expect(el).toHaveClass('opacity-100'))
  },
}

/**
 * Debajo del fold de un contenedor scrolleable: nunca intersecta, se queda en el
 * estado inicial (oculto, sin animar).
 *
 * OJO — esta story tiene que fingir un usuario SIN `prefers-reduced-motion`.
 * El runner corre el browser con `reducedMotion: 'reduce'` (ver
 * vitest.storybook.config.ts: es lo que hace determinista el scan de axe), y `Reveal`
 * hace lo correcto ante eso: si el usuario desactivó las animaciones, muestra el
 * contenido de INMEDIATO sin esperar al IntersectionObserver — ocultarle contenido a
 * alguien que pidió menos movimiento sería un bug de accesibilidad grave.
 *
 * O sea que el estado "todavía no revelado" NO EXISTE bajo reduced-motion. Sin este
 * stub de matchMedia, la story estaría afirmando algo que el componente, por diseño,
 * nunca hace. El camino de reduced-motion lo cubre la story `MovimientoReducido`.
 */
export const AntesDeIntersectar: Story = {
  beforeEach: () => {
    const real = window.matchMedia
    window.matchMedia = ((query: string) =>
      query.includes('prefers-reduced-motion')
        ? { ...real(query), matches: false }
        : real(query)) as typeof window.matchMedia
    return () => {
      window.matchMedia = real
    }
  },
  decorators: [
    (Story) => (
      // tabIndex=0: región scrolleable propia del fixture (no existe en
      // producción) — sin esto, un usuario de teclado no puede scrollearla
      // (scrollable-region-focusable, axe).
      <div
        tabIndex={0}
        style={{ height: 220, overflow: 'auto' }}
        className="rounded-lg border border-dashed border-border"
      >
        <div style={{ height: 600 }} className="flex items-center justify-center text-xs text-muted-foreground">
          Scrolleá para ver el contenido
        </div>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const el = canvas.getByText('Contenido revelado').parentElement!
    await expect(el).toHaveClass('opacity-0')
    await expect(el).toHaveClass('translate-y-4')
  },
}

/**
 * Regresión de producción (landing casi vacía en iPhone real): un flick de
 * mobile puede mover el scroll de "el elemento está debajo del viewport" a
 * "ya quedó arriba del viewport" en un único frame de composición, sin que el
 * IntersectionObserver llegue a registrar ninguna muestra con overlap — la
 * sección quedaba `opacity:0` PARA SIEMPRE. Se reproduce asignando `scrollTop`
 * directo (salto instantáneo, sin frames intermedios) en vez de animarlo, que
 * es la peor condición posible para el IntersectionObserver y el escenario
 * real de un flick rápido.
 */
export const RevelaTrasSaltoDeScrollRapido: Story = {
  beforeEach: () => {
    const real = window.matchMedia
    window.matchMedia = ((query: string) =>
      query.includes('prefers-reduced-motion')
        ? { ...real(query), matches: false }
        : real(query)) as typeof window.matchMedia
    return () => {
      window.matchMedia = real
    }
  },
  decorators: [
    (Story) => (
      <div
        data-testid="scroll-container"
        tabIndex={0}
        style={{ height: 220, overflow: 'auto' }}
        className="rounded-lg border border-dashed border-border"
      >
        <div style={{ height: 600 }} className="flex items-center justify-center text-xs text-muted-foreground">
          Scrolleá para ver el contenido
        </div>
        <Story />
        <div style={{ height: 600 }} aria-hidden />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const el = canvas.getByText('Contenido revelado').parentElement!
    const container = canvasElement.querySelector<HTMLElement>('[data-testid="scroll-container"]')!

    // Salto instantáneo de 0 a "bien pasado el elemento" — sin animación, sin
    // frames intermedios. Si el fix dependiera solo del IntersectionObserver,
    // esto reproduciría el bug: el elemento nunca pasa por un estado con
    // overlap > 0 antes de quedar completamente arriba del viewport.
    container.scrollTop = container.scrollHeight
    container.dispatchEvent(new Event('scroll'))

    await waitFor(() => expect(el).toHaveClass('opacity-100'))
  },
}

/** `prefers-reduced-motion: reduce`: aparece de inmediato, sin animar. */
export const MovimientoReducido: Story = {
  parameters: { reducedMotion: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const el = canvas.getByText('Contenido revelado').parentElement!
    await expect(el).toHaveClass('opacity-100')
  },
}
