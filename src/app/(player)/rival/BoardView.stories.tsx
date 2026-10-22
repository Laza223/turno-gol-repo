import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import { BoardView } from './BoardView'

// Reloj congelado de las stories: sábado 2026-03-14, 15:30 ART.
const NOW = new Date('2026-03-14T18:30:00Z')

const item = (o: Partial<RivalBoardItem> & { id: string }): RivalBoardItem => ({
  tenantId: 't1',
  tenantName: 'El Vagón',
  tenantSlug: 'el-vagon',
  startsAt: new Date('2026-03-14T23:00:00Z'), // hoy 20:00
  format: 5,
  capacity: 10,
  level: 'parejo',
  seeking: 'players',
  seekingPosition: 'any',
  confirmedCount: 7,
  hasStamp: true,
  ...o,
})

const items: RivalBoardItem[] = [
  item({ id: 'a' }),
  item({ id: 'b', confirmedCount: 9, startsAt: new Date('2026-03-14T22:00:00Z'), hasStamp: false }),
  item({
    id: 'c',
    tenantId: 't2',
    tenantName: 'Open Door',
    seekingPosition: 'goalkeeper',
    startsAt: new Date('2026-03-15T22:00:00Z'),
    level: 'picante',
  }),
  item({
    id: 'd',
    seeking: 'rival',
    seekingPosition: null,
    capacity: 5,
    confirmedCount: 5,
    startsAt: new Date('2026-03-18T22:30:00Z'),
    level: 'tranqui',
  }),
]

const tenants = [
  { id: 't1', name: 'El Vagón' },
  { id: 't2', name: 'Open Door' },
]

const meta = {
  title: 'Player/Rival/BoardView',
  component: BoardView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/rival' } },
  },
  args: { items, tenants, selectedTenantId: null, now: NOW },
} satisfies Meta<typeof BoardView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Hoy' })).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { name: 'Mañana' })).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { name: 'Esta semana' })).toBeInTheDocument()
    await expect(canvas.getByText('Faltan 3')).toBeInTheDocument()
    await expect(canvas.getByText('Falta 1')).toBeInTheDocument()
    await expect(canvas.getByText('Se busca arquero')).toBeInTheDocument()
    await expect(canvas.getByText('Busca rival')).toBeInTheDocument()
    // El tablón no muestra personas ni linkea a una vista que todavía no existe.
    await expect(canvas.queryByRole('link', { name: /Faltan 3/ })).toBeNull()
  },
}

export const FiltradoPorComplejo: Story = {
  args: { items: items.filter((i) => i.tenantId === 't2'), selectedTenantId: 't2' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Open Door' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(canvas.queryByText('Faltan 3')).toBeNull()
  },
}

export const Vacio: Story = {
  args: { items: [], tenants: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Hoy el tablón está tranquilo. Armá el primero y que se sume quien pueda.'),
    ).toBeInTheDocument()
    await expect(canvas.getAllByRole('link', { name: 'Armar un partido' }).length).toBeGreaterThan(
      0,
    )
  },
}
