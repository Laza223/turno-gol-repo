import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { artDateString } from '@/test/fixtures/clock'
import { AddClosedDateForm } from './AddClosedDateForm'

const MIN_DATE = artDateString()

/** Contenedor real: horarios/page.tsx lo renderiza al pie de la card "Días cerrados". */
const meta = {
  title: 'Admin/Settings/AddClosedDateForm',
  component: AddClosedDateForm,
  parameters: { layout: 'padded' },
  args: {
    minDate: MIN_DATE,
  },
  decorators: [
    (Story) => (
      <div className="card-premium max-w-lg rounded-lg p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">Días cerrados</h2>
        <p className="mb-4 text-sm text-muted-foreground">No hay días cerrados configurados.</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddClosedDateForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
}

export const Agregado: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Agregar' }))
    await expect(await canvas.findByRole('status')).toHaveTextContent('Día agregado.')
  },
}

export const FechaInvalida: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'Fecha inválida.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Agregar' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Fecha inválida.')
  },
}
