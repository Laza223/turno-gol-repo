import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { standingsGroup, standingRow, tournamentStage } from '@/test/fixtures'
import { uid } from '@/test/fixtures/ids'
import { PosicionesTable } from './PosicionesTable'

const meta = {
  title: 'Admin/Torneos/PosicionesTable',
  component: PosicionesTable,
  parameters: { layout: 'padded' },
  args: { groups: [standingsGroup()], advancePerGroup: null },
} satisfies Meta<typeof PosicionesTable>

export default meta
type Story = StoryObj<typeof meta>

/** Liga en curso: una sola tabla, sin línea de clasificación. */
export const Liga: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Posiciones')).toBeVisible()
    // La diferencia de gol va con signo: +5 se lee de un vistazo.
    await expect(canvas.getByText('+5')).toBeVisible()
    await expect(canvas.getByText('-5')).toBeVisible()
    await expect(canvas.queryByText('Clasifica')).toBeNull()
  },
}

/** Zonas: se marca quién clasifica y dónde está la línea de corte. */
export const ConZonasYClasificados: Story = {
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
    await expect(canvas.getByText('Zona B')).toBeVisible()
    // 2 por zona × 2 zonas = 4 badges de clasificación.
    await expect(canvas.getAllByText('Clasifica')).toHaveLength(4)
  },
}

/**
 * El caso que hay que avisar: dos equipos empatados y ningún criterio los
 * separa. Si esto no se dijera, el admin creería que el orden es real.
 */
export const EmpateSinResolver: Story = {
  args: {
    groups: [
      standingsGroup({
        rows: [
          standingRow({
            position: 1,
            teamId: uid(2101),
            teamName: 'Los Pibes',
            points: 4,
            unresolvedTie: true,
          }),
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
    await expect(canvas.getAllByText('Empate sin resolver')).toHaveLength(2)
  },
}

/** Un equipo que se bajó queda en la tabla con sus puntos, con badge. */
export const ConEquipoBajado: Story = {
  args: {
    groups: [
      standingsGroup({
        rows: [
          standingRow({ position: 1, teamName: 'Los Pibes', points: 9 }),
          standingRow({
            position: 2,
            teamId: uid(2103),
            teamName: 'Los Amigos',
            points: 3,
            teamStatus: 'withdrawn',
          }),
        ],
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Se bajó')).toBeVisible()
  },
}

/** Sin resultados todavía. */
export const Vacio: Story = {
  args: { groups: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hay tabla')).toBeVisible()
  },
}
