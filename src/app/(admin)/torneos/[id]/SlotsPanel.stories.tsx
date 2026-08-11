import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { courtFutbol5, courtFutbol7, tournament, tournamentSlots } from '@/test/fixtures'
import { SlotsPanel } from './SlotsPanel'
import type { ReserveSlotsActionResult, TournamentActionResult } from '../actions'

const CANCHA_1 = courtFutbol5()
const CANCHA_2 = courtFutbol7()

const COURTS = [
  { id: CANCHA_1.id, name: CANCHA_1.name },
  { id: CANCHA_2.id, name: CANCHA_2.name },
]

const COURT_NAMES: Record<string, string> = {
  [CANCHA_1.id]: CANCHA_1.name,
  [CANCHA_2.id]: CANCHA_2.name,
}

const reserveOk = async (): Promise<ReserveSlotsActionResult> => ({
  success: true,
  reserved: 4,
  conflicts: [],
})

const meta = {
  title: 'Admin/Torneos/SlotsPanel',
  component: SlotsPanel,
  parameters: { layout: 'padded' },
  args: {
    tournamentId: tournament().id,
    courts: COURTS,
    slots: tournamentSlots(),
    courtNames: COURT_NAMES,
    reserveAction: fn(reserveOk),
    releaseAction: fn(async (): Promise<TournamentActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof SlotsPanel>

export default meta
type Story = StoryObj<typeof meta>

/** El torneo ya tomó un sábado de 14 a 18 en una cancha. */
export const ConHorarios: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('4 horas · 1 cancha · 1 fecha')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /liberar de hoy en adelante/i })).toBeVisible()
  },
}

/** Todavía no se tomó nada: no se ofrece liberar. */
export const SinHorarios: Story = {
  args: { slots: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin horarios tomados')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /liberar de hoy en adelante/i })).toBeNull()
  },
}

/** Hay que elegir cancha antes de poder tomar horarios. */
export const SinCanchaElegida: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /tomar estos horarios/i })).toBeDisabled()
  },
}

/**
 * El estado más importante del módulo y el único que no se ve en ningún lado:
 * algunas horas ya estaban ocupadas, se saltearon, y el resto SÍ se tomó.
 * La operación no aborta — es la garantía del skip-on-conflict.
 */
export const ConConflictos: Story = {
  args: {
    reserveAction: fn(async (): Promise<ReserveSlotsActionResult> => ({
      success: true,
      reserved: 6,
      conflicts: [
        { courtId: CANCHA_1.id, date: '2026-03-21', timeStart: '16:00', timeEnd: '17:00' },
        { courtId: CANCHA_2.id, date: '2026-03-28', timeStart: '15:00', timeEnd: '16:00' },
      ],
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: CANCHA_1.name }))
    await userEvent.click(canvas.getByRole('button', { name: /tomar estos horarios/i }))

    // Por texto y no por role="status": el Toaster del preview global aporta
    // dos live-regions sr-only con ese mismo role, así que findByRole matchea
    // de más. Y con `selector` porque el textContent del contenedor padre
    // también matchea el regex.
    await expect(await canvas.findByText('Se tomaron 6 horas.')).toBeVisible()
    await expect(canvas.getByText(/2 horas ya estaban ocupadas/i, { selector: 'p' })).toBeVisible()
    await expect(canvas.getByText(/21\/03\/2026/, { selector: 'li' })).toBeVisible()
  },
}

/** Ninguna hora estaba libre: es error, no un éxito vacío. */
export const TodoOcupado: Story = {
  args: {
    reserveAction: fn(async (): Promise<ReserveSlotsActionResult> => ({
      success: false,
      error: 'Ninguna de esas horas estaba libre: no se tomó nada.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: CANCHA_1.name }))
    await userEvent.click(canvas.getByRole('button', { name: /tomar estos horarios/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/no se tomó nada/i)
  },
}
