import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { openingHours, openingHoursClosesNextDay } from '@/test/fixtures/tenant'
import { StepSchedule, type SaveWizardScheduleAction } from './StepSchedule'

/** Nunca resuelve: mantiene el botón en estado de carga a propósito. */
const pendingAction: SaveWizardScheduleAction = () => new Promise(() => {})

/**
 * `useFormState` + Server Action por prop (mismo patrón que ReservasPolicyForm,
 * ver `src/app/(admin)/settings/reservas/ReservasPolicyForm.stories.tsx`).
 */
const meta = {
  title: 'Onboarding/StepSchedule',
  component: StepSchedule,
  parameters: {
    layout: 'padded',
    // Acá había una exclusión de axe (`.h-7.text-emerald-600`) por el botón
    // "Restablecer" de ScheduleFields.tsx, que en su momento usaba `text-emerald-600`
    // (3.76:1 sobre blanco, no pasa AA). Ese archivo ya se arregló a
    // `text-emerald-700` — la exclusión quedó vestigial y se borró. El scan pasa sin
    // ella. Una exclusión que sobrevive a su motivo es peor que ninguna: hace pensar
    // que hay deuda donde ya no la hay, y tapa cualquier bug NUEVO en ese selector.
  },
  // Paso 2 vive dentro de `.card-premium rounded-2xl p-6 md:p-8` (ancho, wide=true).
  decorators: [
    (Story) => (
      <div className="card-premium max-w-2xl rounded-2xl p-6 md:p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    hours: openingHours(),
    closesNextDay: false,
  },
} satisfies Meta<typeof StepSchedule>

export default meta
type Story = StoryObj<typeof meta>

/** Horario típico saneado (pages/onboarding.md §4): Continuar sin tocar nada es válido. */
export const HorarioPorDefecto: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox', { name: /cierra después de medianoche/i })).not.toBeChecked()
  },
}

/** Complejo que cierra la madrugada de viernes/sábado (día operativo). */
export const CierraDespuesDeMedianoche: Story = {
  args: {
    hours: openingHoursClosesNextDay(),
    closesNextDay: true,
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox', { name: /cierra después de medianoche/i })).toBeChecked()
  },
}

export const Guardando: Story = {
  args: { action: fn(pendingAction) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /continuar/i }))
    await expect(await canvas.findByRole('button', { name: /guardando/i })).toBeDisabled()
  },
}

export const ErrorDelServidor: Story = {
  args: { action: fn(async () => ({ success: false as const, error: 'Horarios inválidos.' })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /continuar/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Horarios inválidos.')
  },
}
