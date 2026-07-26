import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  tournament,
  tournamentLleno,
  tournamentTeam,
  tournamentTeams,
} from '@/test/fixtures'
import { TeamsPanel } from './TeamsPanel'
import type { TournamentActionResult } from '../actions'

const ok = async (): Promise<TournamentActionResult> => ({ success: true })

/** Vive suelto sobre el fondo de la ficha del torneo (define su propia `bg-card`). */
const meta = {
  title: 'Admin/Torneos/TeamsPanel',
  component: TeamsPanel,
  parameters: { layout: 'padded' },
  args: {
    tournamentId: tournament().id,
    teams: tournamentTeams(),
    maxTeams: tournament().maxTeams,
    addAction: fn(ok),
    removeAction: fn(ok),
  },
} satisfies Meta<typeof TeamsPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Torneo con equipos anotados, incluidos uno bajado y uno descalificado. */
export const ConEquipos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Los Pibes')).toBeVisible()
    // El cupo cuenta solo a los que siguen en carrera: 6 anotados, 2 fuera → 4.
    await expect(canvas.getByText('4 de 12 lugares ocupados')).toBeVisible()
    await expect(canvas.getByText('Se bajó')).toBeVisible()
    await expect(canvas.getByText('Descalificado')).toBeVisible()
  },
}

/** Estado inicial: el encargado todavía no anotó a nadie. */
export const Vacio: Story = {
  args: { teams: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hay equipos anotados.')).toBeVisible()
    // Con cupo declarado el subtítulo cuenta lugares, no equipos.
    await expect(canvas.getByText('0 de 12 lugares ocupados')).toBeVisible()
  },
}

/** Sin cupo declarado: se muestra el conteo a secas, sin "de N lugares". */
export const SinCupo: Story = {
  args: { maxTeams: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('4 equipos anotados')).toBeVisible()
  },
}

/** Cupo lleno: el botón de alta queda deshabilitado y se explica por qué. */
export const CupoLleno: Story = {
  args: {
    maxTeams: tournamentLleno().maxTeams,
    teams: [tournamentTeam(), tournamentTeam({ id: 'b', name: 'Los Otros' })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /anotar/i })).toBeDisabled()
    await expect(canvas.getByText(/llegó al cupo/i)).toBeVisible()
  },
}

/** El nombre ya existe (case-insensitive): la base lo rechaza y se muestra. */
export const ErrorNombreDuplicado: Story = {
  args: {
    addAction: fn(
      async (): Promise<TournamentActionResult> => ({
        success: false,
        error: 'Ya hay un equipo llamado "los pibes" en este torneo.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/nombre del equipo/i), 'los pibes')
    await userEvent.click(canvas.getByRole('button', { name: /anotar/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya hay un equipo/i)
  },
}
