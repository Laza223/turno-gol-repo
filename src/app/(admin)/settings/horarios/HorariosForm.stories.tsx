import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { openingHours, openingHoursClosesNextDay } from '@/test/fixtures/tenant'
import { HorariosForm } from './HorariosForm'

/**
 * Abre "Excepciones y detalles avanzados" solo si está colapsado: el panel
 * arranca abierto cuando la vista ya trae config avanzada (días custom/cerrados
 * o closesNextDay), y un click incondicional lo cerraría.
 */
async function ensureAdvancedOpen(canvas: ReturnType<typeof within>) {
  const trigger = canvas.getByRole('button', { name: 'Excepciones y detalles avanzados' })
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    await userEvent.click(trigger)
  }
}

/** Contenedor real: horarios/page.tsx envuelve el form en `.card-premium` (superficie blanca/dark-glass). */
const meta = {
  title: 'Admin/Settings/HorariosForm',
  component: HorariosForm,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="card-premium max-w-3xl rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Horarios de apertura</h2>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HorariosForm>

export default meta
type Story = StoryObj<typeof meta>

/** Todos los días con el mismo par (view derivado: "general"). */
export const HorarioUniforme: Story = {
  args: {
    hours: openingHours(),
    closesNextDay: false,
    action: fn(async () => ({ success: true as const })),
  },
}

/** viernes/sábado cierran 02:00 (día operativo) — closesNextDay activado y esos 2 días en "custom". */
export const CierraDespuesDeMedianoche: Story = {
  args: {
    hours: openingHoursClosesNextDay(),
    closesNextDay: true,
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Fase 3 UX: el checkbox vive bajo "Excepciones y detalles avanzados";
    // con closesNextDay=true el panel ya arranca abierto.
    await ensureAdvancedOpen(canvas)
    const checkbox = await canvas.findByRole('checkbox', { name: /cierra después de medianoche/i })
    await expect(checkbox).toBeChecked()
  },
}

/** Domingo cerrado (`closed: true`) — view derivado: "closed" para ese día. */
export const ConDiaCerrado: Story = {
  args: {
    hours: openingHours({ sun: { open: '09:00', close: '22:00', closed: true } }),
    closesNextDay: false,
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await ensureAdvancedOpen(canvas)
    const domingo = await canvas.findByRole('checkbox', { name: /domingo abierto/i })
    await expect(domingo).not.toBeChecked()
  },
}

export const ErrorDelServidor: Story = {
  args: {
    hours: openingHours(),
    closesNextDay: false,
    action: fn(async () => ({ success: false as const, error: 'Formato de horario inválido.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar horarios' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Formato de horario inválido.')
  },
}
