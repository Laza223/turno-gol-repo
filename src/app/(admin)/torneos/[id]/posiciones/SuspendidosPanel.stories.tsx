import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { suspensionRows } from '@/test/fixtures'
import { SuspendidosPanel, type SuspendidoView } from './SuspendidosPanel'

// Los nombres los resuelve la page (el motor es puro y no conoce la DB).
const rows: SuspendidoView[] = suspensionRows().map((r, i) => ({
  ...r,
  playerName: i === 0 ? 'Diego Fernández' : 'Martín Sosa',
  teamName: i === 0 ? 'Los Pibes' : 'Deportivo Central',
}))

const meta = {
  title: 'Admin/Torneos/SuspendidosPanel',
  component: SuspendidosPanel,
  parameters: { layout: 'padded' },
  args: { rows },
} satisfies Meta<typeof SuspendidosPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Uno por amarillas y otro por roja: los dos motivos, con su cantidad. */
export const ConSuspendidos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Diego Fernández')).toBeVisible()
    await expect(canvas.getByText(/Acumulación de amarillas/)).toBeVisible()
    await expect(canvas.getByText(/Expulsión/)).toBeVisible()
    await expect(canvas.getByText('Debe 1 fecha')).toBeVisible()
    await expect(canvas.getByText('Debe 2 fechas')).toBeVisible()
  },
}

/**
 * Debe fechas pero al equipo no le quedan partidos: la suspensión no se pierde,
 * queda esperando a que se agende la próxima fecha.
 */
export const SinPartidosPorDelante: Story = {
  args: {
    rows: [{ ...rows[0]!, suspendedMatchIds: [] }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Sin partidos programados por delante/)).toBeVisible()
  },
}

/** Nadie suspendido: el estado normal. */
export const Vacio: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No hay jugadores suspendidos.')).toBeVisible()
  },
}
