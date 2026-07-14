import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import PitchLines from './PitchLines'

/**
 * SVG decorativo puro (`currentColor`, `aria-hidden`): el color sale del
 * contenedor. Se reproducen los DOS usos reales — `SearchBand` (`variant="band"`,
 * dentro de `.player-hero-band`) y `EmptyResults` (`variant="empty"`, contenedor
 * cuadrado neutro) — para no mostrarlo "pelado" sobre un fondo que no existe en la app.
 */
const meta = {
  title: 'Public/PitchLines',
  component: PitchLines,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PitchLines>

export default meta
type Story = StoryObj<typeof meta>

/** Uso real en `SearchBand`: banda ancha, líneas apenas visibles a la derecha. */
export const Band: Story = {
  render: () => (
    <section className="player-hero-band relative isolate overflow-hidden rounded-3xl border px-9 py-9">
      <div className="pointer-events-none absolute inset-y-0 right-[-8%] -z-10 w-[72%] text-emerald-600/16 dark:text-white/5">
        <PitchLines variant="band" className="h-full w-full" />
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        Motivo decorativo detrás del titular de la banda de búsqueda — nunca transporta información.
      </p>
    </section>
  ),
}

/** Uso real en `EmptyResults`: contenedor cuadrado, líneas centradas y completas. */
export const Empty: Story = {
  render: () => (
    <div className="flex h-64 w-64 items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground/30">
      <PitchLines variant="empty" className="h-full w-full" />
    </div>
  ),
}
