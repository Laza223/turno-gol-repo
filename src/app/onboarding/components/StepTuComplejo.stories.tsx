import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { StepTuComplejo } from './StepTuComplejo'

const meta = {
  title: 'Onboarding/StepTuComplejo',
  component: StepTuComplejo,
  parameters: { layout: 'fullscreen' },
  args: {
    action: fn(async () => ({ success: true as const, next: '/onboarding/resumen' })),
  },
} satisfies Meta<typeof StepTuComplejo>

export default meta
type Story = StoryObj<typeof meta>

/** Un toque por pantalla: cada opción avanza sola y la última guarda las tres respuestas. */
export const TresToques: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: '¿Cómo tomás los turnos hoy?' })).toBeVisible()
    await userEvent.click(canvas.getByRole('radio', { name: 'En un cuaderno o planilla' }))

    await expect(
      await canvas.findByRole('heading', {
        name: '¿Tenés equipos que juegan fijo todas las semanas?',
      }),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('radio', { name: 'Sí' }))

    await expect(
      await canvas.findByRole('heading', { name: '¿Tenés buffet o kiosco?' }),
    ).toBeVisible()
    await expect(canvas.getByText('Si no, no te lo mostramos.')).toBeVisible()
    await userEvent.click(canvas.getByRole('radio', { name: 'No' }))

    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith({
        bookingIntake: 'notebook',
        hasFixedTeams: true,
        canteenEnabled: false,
      }),
    )
  },
}

/** Sin elegir no pasa a la pantalla siguiente. */
export const SinElegir: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Elegí una opción para seguir.',
    )
    await expect(canvas.getByRole('heading', { name: '¿Cómo tomás los turnos hoy?' })).toBeVisible()
  },
}

/** Revisita: viene con lo ya elegido, "Siguiente" avanza sin volver a tocar y "Atrás" vuelve. */
export const Revisita: Story = {
  args: {
    initial: { bookingIntake: 'whatsapp', hasFixedTeams: false, canteenEnabled: true },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: 'Por WhatsApp' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Siguiente' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Siguiente' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith({
        bookingIntake: 'whatsapp',
        hasFixedTeams: false,
        canteenEnabled: true,
      }),
    )
  },
}
