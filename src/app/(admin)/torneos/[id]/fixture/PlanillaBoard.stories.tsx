import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  planillaCourts,
  planillaMatches,
  planillaSlots,
  tournament,
  tournamentMatch,
} from '@/test/fixtures'
import { PlanillaBoard } from './PlanillaBoard'
import type { TournamentActionResult } from '../../actions'

/**
 * El tablero de las horas del torneo. Las stories cubren los cuatro estados de
 * un hueco, porque son lo único que hace usable a `rescheduleMatch`: sin ellos
 * el encargado adivina en qué horas puede poner un partido.
 */
const meta = {
  title: 'Admin/Torneos/PlanillaBoard',
  component: PlanillaBoard,
  parameters: { layout: 'padded' },
  args: {
    tournamentId: tournament().id,
    slots: planillaSlots(),
    matches: planillaMatches(),
    courts: planillaCourts(),
    matchDurationMinutes: 60,
    restBetweenMatchesMinutes: 0,
    rescheduleAction: fn(async (): Promise<TournamentActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof PlanillaBoard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * `ResponsiveList` deja las dos vistas en el DOM (tabla en `sm+`, cards en
 * mobile) y esconde una por CSS, así que cualquier conteo tiene que scopearse.
 * La tabla va primero en el DOM, igual que en los e2e de escritorio.
 */
function board(canvasElement: HTMLElement) {
  return within(within(canvasElement).getByRole('table'))
}

/** En reposo: los partidos ubicados adentro de sus horas, y el riel de los que no. */
export const Tablero: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/^Sin agendar/)).toBeVisible()
    // Los tres huecos vacíos se leen como libres, no como un espacio en blanco.
    await expect(board(canvasElement).getAllByText('Libre')).toHaveLength(3)
    // El partido jugado muestra su resultado dentro del hueco.
    await expect(board(canvasElement).getByText('3 - 1')).toBeVisible()
  },
}

/**
 * Modo mover: el estado que justifica el tablero entero. Los tres estados
 * ilegales se dicen con texto, no solo con color — la hora ocupada nombra el
 * partido que está ahí y la del equipo ocupado nombra al equipo.
 */
export const MoviendoUnPartido: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(
      canvas.getByRole('button', {
        name: /ubicar los pibes vs real sociedad de fútbol/i,
      }),
    )

    await expect(await canvas.findByRole('status')).toHaveTextContent(/Moviendo/)
    // De los 6 huecos quedan 2 destinos: las 20 están ocupadas en las dos
    // canchas, a las 21 la cancha 1 tiene partido y la cancha 2 la bloquea Los
    // Pibes (que juegan a esa hora en la otra). Libres, las dos de las 22.
    await expect(
      board(canvasElement).getAllByRole('button', { name: /mover el partido acá/i }),
    ).toHaveLength(2)
    await expect(
      board(canvasElement).getByText('Los Pibes ya tiene otro partido a esa hora.'),
    ).toBeVisible()
    // Las horas ocupadas siguen mostrando su partido: no hacen falta motivos
    // para lo que ya se ve.
    await expect(
      board(canvasElement).getByRole('link', { name: 'Los Pibes vs Atlético Fondo' }),
    ).toBeVisible()
  },
}

/** Ubicar un partido dispara la acción con la cancha y el instante del hueco. */
export const UbicaEnUnHuecoLibre: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)

    await userEvent.click(
      canvas.getByRole('button', { name: /ubicar los pibes vs real sociedad/i }),
    )
    await canvas.findByRole('status')
    const targets = board(canvasElement).getAllByRole('button', {
      name: /mover el partido acá/i,
    })
    await userEvent.click(targets[0]!)

    await expect(args.rescheduleAction).toHaveBeenCalledTimes(1)
    const payload = (args.rescheduleAction as ReturnType<typeof fn>).mock.calls[0]![0] as {
      matchId: string
      courtId: string
      startsAt: string
    }
    await expect(payload.matchId).toBe(planillaMatches()[3]!.id)
    await expect(typeof payload.startsAt).toBe('string')
  },
}

/** Un rechazo del servidor se muestra sin sacar al usuario del modo mover. */
export const ErrorDelServidor: Story = {
  args: {
    rescheduleAction: fn(
      async (): Promise<TournamentActionResult> => ({
        success: false,
        error: 'Esa cancha ya tiene otro partido a esa hora.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(
      canvas.getByRole('button', { name: /ubicar los pibes vs real sociedad/i }),
    )
    await canvas.findByRole('status')
    await userEvent.click(
      board(canvasElement).getAllByRole('button', { name: /mover el partido acá/i })[0]!,
    )

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya tiene otro partido/i)
    // Sigue en modo mover: el aviso de arriba no se fue.
    await expect(canvas.getByRole('status')).toHaveTextContent(/Moviendo/)
  },
}

/**
 * Sin horas tomadas no hay tablero que dibujar: el vacío explica el modelo
 * (los partidos viven adentro de horas del torneo) y lleva a tomarlas.
 */
export const SinHorasTomadas: Story = {
  args: { slots: [], matches: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('El torneo todavía no tiene horas tomadas')).toBeVisible()
    await expect(canvas.getByRole('link', { name: /tomar horarios/i })).toBeVisible()
  },
}

/**
 * Un partido agendado en una hora que el torneo ya no posee (se liberó el
 * horario). El tablero no puede dibujarlo en ninguna celda: si no lo mostrara
 * en su propio riel, el partido desaparecería de la pantalla sin aviso.
 */
export const PartidoFueraDeHorario: Story = {
  args: {
    matches: [
      ...planillaMatches().slice(0, 3),
      tournamentMatch({
        id: 'huerfano-1',
        homeTeamName: 'Atlético Fondo',
        awayTeamName: 'FC Cerveza',
        startsAt: new Date('2020-01-01T23:00:00Z'),
        endsAt: new Date('2020-01-02T00:00:00Z'),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/^Fuera de las horas del torneo/)).toBeVisible()
    // Está en su riel, no adentro del tablero: ninguna celda lo puede contener.
    await expect(canvas.getByRole('link', { name: 'Atlético Fondo vs FC Cerveza' })).toBeVisible()
    await expect(board(canvasElement).queryByText('Atlético Fondo vs FC Cerveza')).toBeNull()
  },
}

/**
 * Relámpago: partidos de 25 minutos con 5 de recambio. En la misma hora de 60
 * entran dos, y el tablero lo muestra sin que nadie tenga que hacer la cuenta.
 */
export const Relampago: Story = {
  args: {
    matches: [],
    matchDurationMinutes: 25,
    restBetweenMatchesMinutes: 5,
  },
  play: async ({ canvasElement }) => {
    // 6 horas tomadas × 2 huecos de 25' + 5' de recambio en cada una.
    await expect(board(canvasElement).getAllByText('Libre')).toHaveLength(12)
  },
}
