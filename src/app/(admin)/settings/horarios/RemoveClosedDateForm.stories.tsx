import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { artDateString, daysFromNow } from '@/test/fixtures/clock'
import { RemoveClosedDateForm } from './RemoveClosedDateForm'

const CLOSED_DATE = artDateString(daysFromNow(20)) // '2026-04-03'
const LABEL = new Date(`${CLOSED_DATE}T12:00:00`).toLocaleDateString('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** Contenedor real: una fila `<li>` de la lista de días cerrados (horarios/page.tsx). */
const meta = {
  title: 'Admin/Settings/RemoveClosedDateForm',
  component: RemoveClosedDateForm,
  parameters: { layout: 'padded' },
  args: {
    date: CLOSED_DATE,
  },
  decorators: [
    (Story) => (
      <div className="card-premium max-w-lg rounded-lg p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">Días cerrados</h2>
        <ul className="space-y-2">
          <li className="flex items-center justify-between rounded-md border border-border px-4 py-2">
            <span className="text-sm text-foreground">{LABEL}</span>
            <Story />
          </li>
        </ul>
      </div>
    ),
  ],
} satisfies Meta<typeof RemoveClosedDateForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
}

export const ErrorDelServidor: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'No se pudo quitar el día.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Quitar' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('No se pudo quitar el día.')
  },
}
