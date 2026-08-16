import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import type { FirstBookingCourtSlots } from '@/modules/onboarding/onboarding.service'
import type { CreateFirstBookingResult } from '@/modules/onboarding/onboarding.types'
import { StepFirstBooking } from './StepFirstBooking'

/**
 * Las Server Actions entran por prop (mismo motivo que el resto del wizard:
 * `actions.ts` es `'use server'` y arrastra drizzle/postgres al bundle de
 * browser si se importa como valor). `fullscreen`, sin decorator: el shell
 * arma su propio `card-premium`.
 */
const COURT_CON_SLOTS: FirstBookingCourtSlots = {
  courtId: 'court-1',
  courtName: 'Cancha 1',
  slots: [
    { timeStart: '18:00', timeEnd: '19:00', price: 2_000_000, available: true },
    { timeStart: '19:00', timeEnd: '20:00', price: 2_000_000, available: true },
    { timeStart: '20:00', timeEnd: '21:00', price: 2_200_000, available: true },
  ],
}

const meta = {
  title: 'Onboarding/StepFirstBooking',
  component: StepFirstBooking,
  parameters: { layout: 'fullscreen' },
  args: {
    date: '2026-08-16',
    courts: [COURT_CON_SLOTS],
    action: fn(async (): Promise<CreateFirstBookingResult> => ({
      success: true,
      booking: { courtId: 'court-1', timeStart: '18:00', timeEnd: '19:00' },
    })),
    finishAction: fn(async () => {}),
  },
} satisfies Meta<typeof StepFirstBooking>

export default meta
type Story = StoryObj<typeof meta>

/** Sin turno cargado todavía: el CTA es "Saltar por ahora" (skippable siempre). */
export const ConSlotsLibres: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: '18:00' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /saltar por ahora/i })).toBeVisible()
    await expect(
      canvas.queryByRole('button', { name: /terminar y ver mi complejo/i }),
    ).not.toBeInTheDocument()
  },
}

/** Hoy no quedan horarios: EmptyState en vez de una grilla vacía fingiendo horas. */
export const SinSlotsLibres: Story = {
  args: { courts: [{ ...COURT_CON_SLOTS, slots: [] }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Hoy no quedan horarios libres')).toBeInTheDocument()
  },
}

/** Click en un slot: se abre el mini-form con la franja y el precio. */
export const SlotActivo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '18:00' }))
    await expect(canvas.getByText(/cancha 1 · 18:00–19:00/i)).toBeInTheDocument()
    await expect(canvas.getByLabelText(/a nombre de quién/i)).toHaveFocus()
  },
}

/** El server rechaza la reserva (ej. el slot se ocupó): el error queda en el mini-form. */
export const ErrorAlConfirmar: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'Este turno acaba de ser tomado.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '18:00' }))
    await userEvent.type(canvas.getByLabelText(/a nombre de quién/i), 'Juan')
    await userEvent.click(canvas.getByRole('button', { name: /confirmar turno/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Este turno acaba de ser tomado.',
    )
  },
}

/** Turno cargado: banner de éxito + el CTA primario cambia a "Terminar y ver mi complejo". */
export const TurnoCargado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '18:00' }))
    await userEvent.type(canvas.getByLabelText(/a nombre de quién/i), 'Juan')
    await userEvent.click(canvas.getByRole('button', { name: /confirmar turno/i }))
    await expect(
      await canvas.findByText('¡Turno cargado! Ya está en tu grilla.'),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /terminar y ver mi complejo/i })).toBeVisible()
    await expect(
      canvas.queryByRole('button', { name: /saltar por ahora/i }),
    ).not.toBeInTheDocument()
    // El slot recién cargado queda tildado y deshabilitado — no se puede volver a tocar.
    await expect(canvas.getByRole('button', { name: /18:00/i })).toBeDisabled()
  },
}

const confirmando = pendingAction({
  success: true as const,
  booking: { courtId: 'court-1', timeStart: '18:00', timeEnd: '19:00' },
})

export const ConfirmandoPending: Story = {
  args: { action: fn(confirmando.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '18:00' }))
    await userEvent.type(canvas.getByLabelText(/a nombre de quién/i), 'Juan')
    const submit = canvas.getByRole('button', { name: /confirmar turno/i })
    await userEvent.click(submit)
    await expect(submit).toBeDisabled()
    // Al resolver, el mini-form se DESMONTA (reemplazado por el banner de
    // éxito) — no alcanza con esperar a que `submit` se reactive, porque nunca
    // lo hace: queda desconectado del documento. `release` ya sabe leer esa
    // señal (ver el comentario en pending-action.ts).
    await confirmando.release(submit)
  },
}

/**
 * "Volver" es un link al paso anterior, no una Server Action: ahora que el paso
 * vive en la URL, retroceder es navegar.
 */
export const VolverEsUnLink: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const back = canvas.getByRole('link', { name: /^volver$/i })
    await expect(back).toHaveAttribute('href', '/onboarding/canchas')
  },
}
