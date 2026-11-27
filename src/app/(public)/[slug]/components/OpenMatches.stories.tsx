import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import OpenMatches from './OpenMatches'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

const item = (o: Partial<RivalBoardItem> & { id: string }): RivalBoardItem => ({
  tenantId: TENANT_ID,
  tenantName: 'Complejo Fénix',
  tenantSlug: 'complejo-fenix',
  startsAt: new Date('2026-03-15T00:00:00Z'),
  format: 5,
  capacity: 10,
  level: 'parejo',
  seeking: 'players',
  seekingPosition: 'any',
  confirmedCount: 9,
  hasStamp: true,
  ...o,
})

/** "Partidos abiertos" de la ficha: los de RIVAL publicados en este complejo, en vidrio pintado. */
const meta = {
  title: 'Player/TenantProfile/OpenMatches',
  component: OpenMatches,
  parameters: { layout: 'fullscreen' },
  args: { tenantId: TENANT_ID },
  decorators: [
    (Story) => (
      <div data-portal-glass className="portal-ambient p-4 text-portal-ink">
        <div className="mx-auto max-w-[566px]">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof OpenMatches>

export default meta
type Story = StoryObj<typeof meta>

/** Dos partidos: uno que busca jugadores y uno que busca rival; cada tarjeta es un link al partido. */
export const ConPartidos: Story = {
  args: {
    items: [
      item({ id: 'a' }),
      item({
        id: 'b',
        seeking: 'rival',
        seekingPosition: null,
        format: 7,
        capacity: 7,
        confirmedCount: 7,
        startsAt: new Date('2026-03-21T23:00:00Z'),
        hasStamp: false,
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 2, name: 'Partidos abiertos' })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ver partidos abiertos' })).toHaveAttribute(
      'href',
      `/rival?complejo=${TENANT_ID}`,
    )
    await expect(canvas.getByText('Falta 1')).toBeVisible()
    await expect(canvas.getByText('Busca rival')).toBeVisible()
    await expect(canvas.getByText('Ya son 9 de 10')).toBeVisible()
    const first = canvas.getByRole('link', { name: /Quiero sumarme/ })
    await expect(first).toHaveAttribute('href', '/rival/partido/a')
    await expect(canvas.getByRole('link', { name: /Anotar a mi equipo/ })).toHaveAttribute(
      'href',
      '/rival/partido/b',
    )
  },
}

/** Sin partidos no hay sección: ni título ni link. */
export const SinPartidos: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('heading')).toBeNull()
    await expect(within(canvasElement).queryByRole('link')).toBeNull()
  },
}
