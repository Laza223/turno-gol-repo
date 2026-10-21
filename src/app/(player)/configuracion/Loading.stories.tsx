import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { player } from '@/test/fixtures/player'
import { ConfiguracionView } from './ConfiguracionView'
import Loading from './loading'

/** Esqueleto de /configuracion, en la columna de la página. */
const meta = {
  title: 'Player/Configuracion/LoadingSkeleton',
  component: Loading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Loading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

const base = player()

/**
 * El esqueleto ocupa el alto de la página real (dos favoritos, con partidos), pasada a pasada: si
 * no, al cargar el contenido salta. Se compara el alto de los dos contenedores y el de cada bloque.
 */
export const AlturaDelEsqueleto: Story = {
  render: () => (
    <>
      <div data-t="esqueleto">
        <Loading />
      </div>
      <div data-t="real">
        <ConfiguracionView
          profile={{
            firstName: base.firstName,
            lastName: base.lastName,
            phone: base.phone ?? '',
            preferredArea: 'Palermo',
          }}
          email={base.email}
          favorites={[
            { id: 't1', slug: 'a', name: 'Complejo Fénix', city: 'Rosario' },
            { id: 't2', slug: 'b', name: 'Canchas del Sur', city: 'Funes' },
          ]}
          activity={{ played: 12, venues: 3, streakWeeks: 4 }}
          updateProfileAction={async () => ({ success: true as const })}
          signOutAction={async () => {}}
        />
      </div>
    </>
  ),
  play: async ({ canvasElement }) => {
    const esqueleto = canvasElement.querySelector('[data-t="esqueleto"]')!
    const real = canvasElement.querySelector('[data-t="real"]')!
    const tops = (root: Element) =>
      [...root.querySelectorAll(':scope > div > div.rounded-2xl')].map(
        (b) => b.getBoundingClientRect().top - root.getBoundingClientRect().top,
      )
    const a = tops(esqueleto)
    const b = tops(real)
    await expect(a).toHaveLength(6)
    await expect(b).toHaveLength(6)
    for (let i = 0; i < a.length; i++) {
      await expect(Math.abs(a[i]! - b[i]!), `bloque ${i + 1}`).toBeLessThanOrEqual(12)
    }
    await expect(
      Math.abs(esqueleto.getBoundingClientRect().height - real.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(24)
  },
}
