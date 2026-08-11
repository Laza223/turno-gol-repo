import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { tournament } from '@/test/fixtures'
import { CorteZonasCard } from './CorteZonasCard'
import type { CrossPreview } from './corte-lib'
import type { TournamentActionResult } from '../../actions'

const ok = async (): Promise<TournamentActionResult> => ({ success: true })

/** Semifinales de un torneo de 2 zonas: 1ºA-2ºB y 1ºB-2ºA. */
const CROSSES: CrossPreview[] = [
  {
    id: 'sf-1',
    round: 'Semifinal',
    homeLabel: '1º Zona A',
    homeTeamName: 'Los Pibes',
    awayLabel: '2º Zona B',
    awayTeamName: 'FC Cerveza',
  },
  {
    id: 'sf-2',
    round: 'Semifinal',
    homeLabel: '1º Zona B',
    homeTeamName: 'Real Sociedad de Fútbol',
    awayLabel: '2º Zona A',
    awayTeamName: 'Atlético Fondo',
  },
]

const meta = {
  title: 'Admin/Torneos/CorteZonasCard',
  component: CorteZonasCard,
  parameters: { layout: 'padded' },
  args: {
    tournamentId: tournament().id,
    pendingGroupMatches: 0,
    crosses: CROSSES,
    tie: null,
    alreadySeeded: false,
    canSeed: true,
    seedAction: fn(ok),
    updateTeamAction: fn(ok),
  },
} satisfies Meta<typeof CorteZonasCard>

export default meta
type Story = StoryObj<typeof meta>

/** Zonas terminadas: se puede sortear, y ya se ve cómo va a quedar el cuadro. */
export const ListoParaSortear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Así quedarían los cruces')).toBeVisible()
    await expect(canvas.getByText('1º Zona A')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /cerrar zonas y sortear/i })).toBeEnabled()
  },
}

/**
 * El bloqueo más común: todavía se juegan las zonas. Se dice cuántos partidos
 * faltan en vez de dejar que el usuario coma el error del servidor.
 */
export const FaltanPartidosDeZona: Story = {
  args: {
    pendingGroupMatches: 3,
    crosses: CROSSES.map((c) => ({ ...c, homeTeamName: null, awayTeamName: null })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Faltan 3 partidos de zona/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: /cerrar zonas y sortear/i })).toBeDisabled()
    // Sin equipos resueltos el cuadro se dibuja igual, con los puestos.
    await expect(canvas.getByText('1º Zona A')).toBeVisible()
    await expect(canvas.getByText(/Los equipos se confirman al cerrar las zonas/)).toBeVisible()
  },
}

/** Un solo partido: el texto no dice "1 partidos". */
export const FaltaUnPartido: Story = {
  args: { pendingGroupMatches: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Falta 1 partido de zona')).toBeVisible()
  },
}

/**
 * El caso que hasta ahora no tenía salida: el empate en la línea de corte. El
 * mensaje de error del servidor dice "cargales el número de siembra"; acá está
 * dónde cargarlo.
 */
export const EmpateEnElCorte: Story = {
  args: {
    tie: {
      groupLabel: 'A',
      teams: [
        { teamId: 't-1', teamName: 'Los Pibes', seed: null },
        { teamId: 't-2', teamName: 'Atlético Fondo', seed: null },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/están empatados justo en el puesto de corte/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: /cerrar zonas y sortear/i })).toBeDisabled()

    await userEvent.click(canvas.getByRole('button', { name: /definir el sorteo/i }))
    // waitFor: el diálogo de Radix todavía está animando cuando findByRole
    // resuelve, y en CI (2 cores) los inputs no están listos para leerse.
    const dialog = await within(document.body).findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByLabelText('Los Pibes')).toHaveValue(1))
    await expect(within(dialog).getByLabelText('Atlético Fondo')).toHaveValue(2)
  },
}

/** Dos equipos no pueden compartir número: el guardado queda bloqueado. */
export const SorteoConNumerosRepetidos: Story = {
  args: {
    tie: {
      groupLabel: 'A',
      teams: [
        { teamId: 't-1', teamName: 'Los Pibes', seed: null },
        { teamId: 't-2', teamName: 'Atlético Fondo', seed: null },
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /definir el sorteo/i }))

    const dialog = await within(document.body).findByRole('dialog')
    const segundo = await within(dialog).findByLabelText('Atlético Fondo')
    await userEvent.clear(segundo)
    await userEvent.type(segundo, '1')

    await expect(within(dialog).getByRole('alert')).toHaveTextContent(/mismo número/i)
    await userEvent.click(within(dialog).getByRole('button', { name: /guardar el sorteo/i }))
    await expect(args.updateTeamAction).not.toHaveBeenCalled()
  },
}

/** Ya sembrado: la tarjeta pasa a ser informativa y no ofrece volver a sortear. */
export const YaSorteado: Story = {
  args: { alreadySeeded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cruces sorteados')).toBeVisible()
    await expect(canvas.getByText('Las zonas están cerradas.')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /cerrar zonas y sortear/i })).toBeNull()
  },
}

/** El encargado ve el estado del corte pero no lo puede cerrar: candado, no vacío. */
export const SinPermiso: Story = {
  args: { canSeed: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: /cerrar zonas y sortear/i })).toBeNull()
    await expect(canvas.getByText(/solo el dueño puede hacerlo/i)).toBeInTheDocument()
    // Y el cuadro se sigue viendo.
    await expect(canvas.getByText('Así quedarían los cruces')).toBeVisible()
  },
}
