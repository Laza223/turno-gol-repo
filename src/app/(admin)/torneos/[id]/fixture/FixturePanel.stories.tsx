import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  planillaCourts,
  planillaMatches,
  planillaSlots,
  tournament,
  tournamentStage,
} from '@/test/fixtures'
import { FixturePanel } from './FixturePanel'
import type { GenerateFixtureActionResult, TournamentActionResult } from '../../actions'

const meta = {
  title: 'Admin/Torneos/FixturePanel',
  component: FixturePanel,
  parameters: { layout: 'padded' },
  args: {
    tournamentId: tournament().id,
    format: 'league' as const,
    stages: [tournamentStage()],
    matches: planillaMatches(),
    slots: planillaSlots(),
    courts: planillaCourts(),
    matchDurationMinutes: 60,
    restBetweenMatchesMinutes: 0,
    generateAction: fn(
      async (): Promise<GenerateFixtureActionResult> => ({
        success: true,
        matches: 6,
        unscheduled: 0,
      }),
    ),
    clearAction: fn(async (): Promise<TournamentActionResult> => ({ success: true })),
    rescheduleAction: fn(async (): Promise<TournamentActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof FixturePanel>

export default meta
type Story = StoryObj<typeof meta>

/** Vista por defecto: la Planilla, con el partido sin agendar en su riel. */
export const ConFixture: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /planilla/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(canvas.getByText(/^Sin agendar/)).toBeVisible()
    await expect(canvas.getByText(/1 sin agendar/)).toBeVisible()
  },
}

/** El toggle cambia a la vista de lectura, agrupada por fecha. */
export const CambiaAListado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /listado/i }))
    await expect(await canvas.findByText('Fecha 1')).toBeVisible()
    await expect(canvas.getByText('Fecha 2')).toBeVisible()
    // El resultado del que se jugó.
    await expect(canvas.getByText('3 - 1')).toBeVisible()
  },
}

/** Sin fixture: se ofrece generarlo. La liga pregunta por las vueltas. */
export const SinFixture: Story = {
  args: { matches: [], stages: [], slots: [], courts: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hay fixture')).toBeVisible()
    await expect(canvas.getByLabelText(/vueltas/i)).toBeVisible()
    // Sin llaves no hay tercer puesto que ofrecer.
    await expect(canvas.queryByText(/tercer puesto/i)).toBeNull()
  },
}

/** Eliminación directa: sin vueltas, pero con la opción del tercer puesto. */
export const SinFixtureEliminacion: Story = {
  args: { matches: [], stages: [], slots: [], courts: [], format: 'knockout' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByLabelText(/vueltas/i)).toBeNull()
    await expect(canvas.getByText(/tercer puesto/i)).toBeVisible()
  },
}

/** Grupos + playoffs: pide zonas y cuántos clasifican. */
export const SinFixtureGrupos: Story = {
  args: { matches: [], stages: [], slots: [], courts: [], format: 'groups_playoff' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/^zonas$/i)).toBeVisible()
    await expect(canvas.getByLabelText(/clasificados/i)).toBeVisible()
  },
}

/**
 * El aviso más importante: se generó todo pero no entró en los horarios
 * tomados. Si esto no se dijera, el admin creería que quedó completo.
 */
export const GeneradoConPartidosSinAgendar: Story = {
  args: {
    matches: [],
    stages: [],
    slots: [],
    courts: [],
    generateAction: fn(
      async (): Promise<GenerateFixtureActionResult> => ({
        success: true,
        matches: 12,
        unscheduled: 5,
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /generar fixture/i }))
    // Por texto y no por role="status": el Toaster global aporta dos
    // live-regions sr-only con ese mismo role.
    await expect(
      await canvas.findByText(/5 quedaron sin día ni hora/i),
    ).toBeVisible()
  },
}

/** Error del servidor: el torneo ya tiene fixture. */
export const ErrorYaTieneFixture: Story = {
  args: {
    matches: [],
    stages: [],
    slots: [],
    courts: [],
    generateAction: fn(
      async (): Promise<GenerateFixtureActionResult> => ({
        success: false,
        error: 'Este torneo ya tiene un fixture de 6 partidos. Borralo antes de generar uno nuevo.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /generar fixture/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya tiene un fixture/i)
  },
}
