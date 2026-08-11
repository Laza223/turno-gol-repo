import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { tournament, tournamentLleno, tournamentTeam, tournamentTeams } from '@/test/fixtures'
import { TeamsPanel } from './TeamsPanel'
import type { SearchPlayersActionResult, TournamentActionResult } from '../actions'

const ok = async (): Promise<TournamentActionResult> => ({ success: true })
const searchOk = async (): Promise<SearchPlayersActionResult> => ({ success: true, players: [] })

/** Vive suelto sobre el fondo de la ficha del torneo (define su propia `bg-card`). */
const meta = {
  title: 'Admin/Torneos/TeamsPanel',
  component: TeamsPanel,
  parameters: { layout: 'padded' },
  args: {
    tournamentId: tournament().id,
    teams: tournamentTeams(),
    maxTeams: tournament().maxTeams,
    rosters: {},
    addAction: fn(ok),
    removeAction: fn(ok),
    updateAction: fn(ok),
    searchCaptainAction: fn(searchOk),
    addPlayerAction: fn(ok),
    removePlayerAction: fn(ok),
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
    addAction: fn(async (): Promise<TournamentActionResult> => ({
      success: false,
      error: 'Ya hay un equipo llamado "los pibes" en este torneo.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/nombre del equipo/i), 'los pibes')
    await userEvent.click(canvas.getByRole('button', { name: /anotar/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya hay un equipo/i)
  },
}

/**
 * La ficha expandida (B16): el estado arriba porque es lo urgente — un equipo
 * que no viene se marca el sábado a la mañana con gente esperando — y los
 * datos detrás de "Editar datos", que se tocan una vez cada tanto.
 */
export const FichaDelEquipo: Story = {
  args: { teams: [tournamentTeam()] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Los Pibes/ }))

    await expect(await canvas.findByRole('radiogroup')).toBeVisible()
    await expect(canvas.getByRole('radio', { name: /Inscripto/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(canvas.getByRole('button', { name: /Editar datos/ })).toBeVisible()
  },
}

/** Bajar un equipo dice antes lo que pasa: cupo, clasificados y partidos jugados. */
export const MarcarQueSeBajo: Story = {
  args: { teams: [tournamentTeam()] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Los Pibes/ }))
    await userEvent.click(await canvas.findByRole('radio', { name: /Se bajó/ }))

    // Dentro de waitFor: Radix está en el primer frame de su animación de
    // entrada cuando findByRole ya resolvió, y un toBeVisible inmediato pierde
    // la carrera en los 2 cores del runner de CI.
    const dialog = await within(document.body).findByRole('dialog')
    await waitFor(() =>
      expect(
        within(dialog).getByText('Deja de ocupar un lugar del cupo del torneo.'),
      ).toBeVisible(),
    )
    await expect(
      within(dialog).getByText('Los partidos que ya jugó quedan como están, con sus resultados.'),
    ).toBeVisible()
  },
}

/** Editar datos: nombre, capitán, teléfono, arancel propio del equipo y notas. */
export const EditarDatos: Story = {
  args: { teams: [tournamentTeam()] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Los Pibes/ }))
    await userEvent.click(await canvas.findByRole('button', { name: /Editar datos/ }))

    await expect(await canvas.findByLabelText(/arancel de inscripción/i)).toBeVisible()
    await expect(canvas.getByLabelText(/notas internas/i)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
  },
}
