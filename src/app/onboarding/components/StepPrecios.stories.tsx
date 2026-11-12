import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { StepPrecios } from './StepPrecios'

const meta = {
  title: 'Onboarding/StepPrecios',
  component: StepPrecios,
  parameters: { layout: 'fullscreen' },
  args: {
    formats: [{ format: 5, count: 2 }],
    action: fn(async () => ({ success: true as const, next: '/onboarding/tu-complejo' })),
  },
} satisfies Meta<typeof StepPrecios>

export default meta
type Story = StoryObj<typeof meta>

/** Con un solo formato el título no nombra el formato. Precio con eco y "mismo precio de noche" de entrada. */
export const UnFormato: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: '¿Cuánto cobrás el turno?' })).toBeVisible()
    await expect(canvas.getByRole('radio', { name: 'No, es el mismo precio' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await userEvent.type(canvas.getByRole('textbox', { name: /precio del turno/i }), '60000')
    await expect(canvas.getByText('Un turno de 60 minutos: $60.000')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith({
        formats: [{ format: 5, count: 2, dayPrice: 6_000_000 }],
      }),
    )
  },
}

/** Sin precio no avanza. */
export const SinPrecio: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Cargá cuánto cobrás el turno.',
    )
    await expect(args.action).not.toHaveBeenCalled()
  },
}

/** "Sí": aparece el precio de noche y "Desde las" (18 por defecto); viajan en centavos. */
export const PrecioDeNoche: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox', { name: /precio del turno/i }), '60000')
    await userEvent.click(canvas.getByRole('radio', { name: /sí, de noche cobro distinto/i }))

    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/turno de noche/i)

    await expect(canvas.getByRole('button', { name: /desde las/i })).toHaveTextContent('18:00')
    await userEvent.type(canvas.getByRole('textbox', { name: /precio de noche/i }), '80000')
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith({
        formats: [{ format: 5, count: 2, dayPrice: 6_000_000, nightPrice: 8_000_000 }],
        cutHour: 18,
      }),
    )
  },
}

/** Una pantalla por formato: el título nombra el formato y la última guarda todo junto. */
export const VariosFormatos: Story = {
  args: {
    formats: [
      { format: 5, count: 2 },
      { format: 7, count: 1 },
    ],
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: '¿Cuánto cobrás el turno de Fútbol 5?' }),
    ).toBeVisible()
    await userEvent.type(canvas.getByRole('textbox', { name: /precio del turno/i }), '60000')
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await expect(
      await canvas.findByRole('heading', { name: '¿Cuánto cobrás el turno de Fútbol 7?' }),
    ).toBeVisible()
    await userEvent.type(canvas.getByRole('textbox', { name: /precio del turno/i }), '90000')
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith({
        formats: [
          { format: 5, count: 2, dayPrice: 6_000_000 },
          { format: 7, count: 1, dayPrice: 9_000_000 },
        ],
      }),
    )
  },
}

/** "Atrás" entre formatos conserva lo ya cargado. */
export const VolverConservaElPrecio: Story = {
  args: {
    formats: [
      { format: 5, count: 1 },
      { format: 8, count: 1 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox', { name: /precio del turno/i }), '60000')
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await canvas.findByRole('heading', { name: /fútbol 8/i })
    await userEvent.click(canvas.getByRole('button', { name: 'Atrás' }))
    await expect(await canvas.findByRole('textbox', { name: /precio del turno/i })).toHaveValue(
      '60.000',
    )
  },
}
