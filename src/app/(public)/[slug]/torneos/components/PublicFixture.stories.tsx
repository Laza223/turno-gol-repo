import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { tournamentFixture, tournamentMatch, tournamentStage } from '@/test/fixtures'
import { uid } from '@/test/fixtures/ids'
import { PublicFixture } from './PublicFixture'

const meta = {
  title: 'Public/Torneos/PublicFixture',
  component: PublicFixture,
  parameters: { layout: 'padded' },
  args: {
    matches: tournamentFixture(),
    stages: [tournamentStage()],
    knockoutStageIds: new Set<string>(),
  },
} satisfies Meta<typeof PublicFixture>

export default meta
type Story = StoryObj<typeof meta>

/** Liga: los partidos se agrupan por fecha. */
export const PorFecha: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Fecha 1' })).toBeVisible()
    await expect(canvas.getByRole('heading', { name: 'Fecha 2' })).toBeVisible()
    await expect(canvas.getByText('3 - 1')).toBeVisible()
    // Un partido sin agendar lo dice, no se esconde.
    await expect(canvas.getByText('Sin agendar')).toBeVisible()
  },
}

/**
 * 'Jugado' al lado de un 3-1 es ruido; 'No se presentó' no se deduce del
 * marcador y por eso sí se muestra.
 */
export const SoloLosEstadosQueNoSeDeducen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Jugado')).toBeNull()
    await expect(canvas.queryByText('Programado')).toBeNull()
  },
}

export const ConWalkover: Story = {
  args: {
    matches: [
      tournamentMatch({
        id: uid(2404),
        status: 'walkover',
        walkoverWinnerTeamId: uid(2101),
        homeScore: 3,
        awayScore: 0,
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No se presentó')).toBeVisible()
  },
}

/** En un cuadro, la llave sin definir muestra cuándo se juega igual. */
export const LlaveSinDefinir: Story = {
  args: {
    stages: [tournamentStage({ name: 'Playoffs', kind: 'knockout', orderIndex: 1 })],
    knockoutStageIds: new Set([tournamentStage().id]),
    matches: [
      tournamentMatch({
        id: uid(2405),
        homeTeamId: null,
        homeTeamName: null,
        awayTeamId: null,
        awayTeamName: null,
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('A definir')).toHaveLength(2)
    await expect(canvas.getByRole('heading', { name: 'Final' })).toBeVisible()
  },
}

export const SinFixture: Story = {
  args: { matches: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('heading', { name: 'Fixture' })).toBeNull()
  },
}
