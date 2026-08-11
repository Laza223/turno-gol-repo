import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  tournamentMatch,
  tournamentMatchEvent,
  tournamentRoster,
  tournamentTeam,
} from '@/test/fixtures'
import { uid } from '@/test/fixtures/ids'
import { ActaPanel } from './ActaPanel'
import type { TournamentActionResult } from '../../../actions'

const ok = () => fn(async (): Promise<TournamentActionResult> => ({ success: true }))

const rosters = [
  { teamId: tournamentTeam().id, teamName: 'Los Pibes', players: tournamentRoster() },
  { teamId: uid(2105), teamName: 'Atlético Fondo', players: [] },
]

const meta = {
  title: 'Admin/Torneos/ActaPanel',
  component: ActaPanel,
  parameters: { layout: 'padded' },
  args: {
    match: tournamentMatch(),
    stageKind: 'league' as const,
    events: [],
    rosters,
    suspendedPlayerIds: [],
    saveResultAction: ok(),
    walkoverAction: ok(),
    clearResultAction: ok(),
    addEventAction: ok(),
    deleteEventAction: ok(),
  },
} satisfies Meta<typeof ActaPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Partido por jugarse: marcador en cero y acta vacía. */
export const SinCargar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hay goles ni tarjetas cargados.')).toBeVisible()
    // Sin resultado cargado no se ofrece borrarlo.
    await expect(canvas.queryByRole('button', { name: /borrar resultado/i })).toBeNull()
    // En liga no hay penales.
    await expect(canvas.queryByText(/penales/i)).toBeNull()
  },
}

/** Con acta cargada: cada evento se puede borrar por fila. */
export const ConActa: Story = {
  args: {
    match: tournamentMatch({ status: 'played', homeScore: 2, awayScore: 1 }),
    events: [
      tournamentMatchEvent(),
      tournamentMatchEvent({ id: uid(2502), type: 'yellow_card', minute: 55 }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Gol')).toBeVisible()
    await expect(canvas.getByText('Amarilla')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /borrar resultado/i })).toBeVisible()
  },
}

/** Llave empatada: es el único caso donde se piden penales. */
export const LlaveEmpatadaPideePenales: Story = {
  args: {
    stageKind: 'knockout',
    match: tournamentMatch({ status: 'played', homeScore: 1, awayScore: 1 }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Una llave no puede terminar empatada/)).toBeVisible()
    await expect(canvas.getByLabelText('Penales local')).toBeVisible()
  },
}

/** Llave sin definir: no se puede cargar nada y se explica por qué. */
export const LlaveSinDefinir: Story = {
  args: {
    match: tournamentMatch({ homeTeamId: null, homeTeamName: null }),
    rosters: [rosters[1]!],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(/Todavía no se sabe qué equipos juegan este partido/),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: /guardar resultado/i })).toBeDisabled()
  },
}

/** Aviso, NO bloqueo: si el árbitro lo dejó jugar, el resultado vale. */
export const ConJugadorSuspendido: Story = {
  args: {
    events: [tournamentMatchEvent()],
    suspendedPlayerIds: [tournamentMatchEvent().teamPlayerId!],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/arrastran fechas de suspensión/)).toBeVisible()
    // Sigue habilitado: es un aviso.
    await expect(canvas.getByRole('button', { name: /guardar resultado/i })).toBeEnabled()
  },
}

/** El error del servidor se muestra arriba, no se pierde. */
export const ErrorDelServidor: Story = {
  args: {
    saveResultAction: fn(async (): Promise<TournamentActionResult> => ({
      success: false,
      error: 'Una llave no puede terminar empatada: cargá la definición por penales.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /guardar resultado/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/no puede terminar empatada/i)
  },
}
