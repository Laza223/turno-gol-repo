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

/** Debajo del fold de un contenedor scrolleable: nunca intersecta, se queda
 * en el estado inicial (oculto, sin animar). */
export const AntesDeIntersectar: Story = {
  decorators: [
    (Story) => (
      <div style={{ height: 220, overflow: 'auto' }} className="rounded-lg border border-dashed border-border">
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

/** `prefers-reduced-motion: reduce`: aparece de inmediato, sin animar. */
export const MovimientoReducido: Story = {
  parameters: { reducedMotion: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const el = canvas.getByText('Contenido revelado').parentElement!
    await expect(el).toHaveClass('opacity-100')
  },
}
