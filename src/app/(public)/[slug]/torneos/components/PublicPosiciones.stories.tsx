import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { standingsGroup, standingRow, tournamentStage } from '@/test/fixtures'
import { uid } from '@/test/fixtures/ids'
import { PublicPosiciones } from './PublicPosiciones'

const meta = {
  title: 'Public/Torneos/PublicPosiciones',
  component: PublicPosiciones,
  parameters: { layout: 'padded' },
  args: { groups: [standingsGroup()], advancePerGroup: null },
} satisfies Meta<typeof PublicPosiciones>

export default meta
type Story = StoryObj<typeof meta>

export const Liga: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Posiciones' })).toBeVisible()
    await expect(canvas.getByText('+5')).toBeVisible()
    await expect(canvas.queryByText('Clasifica')).toBeNull()
  },
}

export const ConZonas: Story = {
  args: {
    advancePerGroup: 2,
    groups: [
      standingsGroup({ groupLabel: 'A' }),
      standingsGroup({
        stageId: tournamentStage().id,
        groupLabel: 'B',
        rows: [
          standingRow({ position: 1, teamId: uid(2105), teamName: 'Atlético Fondo', points: 6 }),
          standingRow({ position: 2, teamId: uid(2106), teamName: 'FC Cerveza', points: 3 }),
        ],
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Zona A')).toBeVisible()
    await expect(canvas.getAllByText('Clasifica')).toHaveLength(4)
  },
}

/**
 * A diferencia de la tabla del panel, un empate sin resolver NO se anuncia:
 * "cargales el número de siembra" es una instrucción para el complejo.
 */
export const EmpateSinResolverNoSeAnuncia: Story = {
  args: {
    groups: [
      standingsGroup({
        rows: [
          standingRow({ position: 1, teamName: 'Los Pibes', points: 4, unresolvedTie: true }),
          standingRow({
            position: 2,
            teamId: uid(2102),
            teamName: 'Deportivo Central',
            points: 4,
            unresolvedTie: true,
          }),
        ],
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Empate sin resolver')).toBeNull()
    // ResponsiveList monta cards Y tabla: cada equipo aparece dos veces en el
    // DOM (una sola visible por breakpoint).
    await expect(canvas.getAllByText('Deportivo Central')).toHaveLength(2)
  },
}

/** Sin tabla la sección no se dibuja: el portal no muestra cajas vacías. */
export const SinTabla: Story = {
  args: { groups: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('heading', { name: 'Posiciones' })).toBeNull()
  },
}
