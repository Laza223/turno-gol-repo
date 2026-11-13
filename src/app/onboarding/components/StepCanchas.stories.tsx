import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { SignupFrame } from './SignupFrame'
import { StepCanchas } from './StepCanchas'

const meta = {
  title: 'Onboarding/StepCanchas',
  component: StepCanchas,
  parameters: { layout: 'fullscreen' },
  // El marco oscuro del alta: sin él los tokens resuelven en claro y la story no se parece a la app.
  decorators: [
    (Story) => (
      <SignupFrame>
        <Story />
      </SignupFrame>
    ),
  ],
  args: {
    action: fn(async () => ({ success: true as const, next: '/onboarding/horarios' })),
  },
} satisfies Meta<typeof StepCanchas>

export default meta
type Story = StoryObj<typeof meta>

/** Fútbol 5 arranca en 1 y el resto en 0: una cancha es un solo toque a "Siguiente". */
export const PorDefecto: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: '¿Qué canchas tenés?' })).toBeVisible()
    const f5 = canvas.getByRole('group', { name: /fútbol 5/i })
    await expect(within(f5).getByText('1')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(args.action).toHaveBeenCalledWith({ '5': 1 }))
  },
}

/** Varios formatos: se tocan los que tiene (de Fútbol 4 a 11) y manda la cantidad de cada uno. */
export const VariosFormatos: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    for (const f of [4, 6, 9, 10]) {
      await expect(canvas.getByRole('button', { name: `Fútbol ${f}` })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    }
    await userEvent.click(canvas.getByRole('button', { name: /más, canchas de fútbol 5/i }))
    await userEvent.click(canvas.getByRole('button', { name: 'Fútbol 7' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Fútbol 4' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(args.action).toHaveBeenCalledWith({ '5': 2, '7': 1, '4': 1 }))
  },
}

/** Sin ninguna cancha no avanza y lo dice. */
export const SinCanchas: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Fútbol 5' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Elegí al menos una cancha.')
    await expect(args.action).not.toHaveBeenCalled()
  },
}

/** Revisita con lo que ya eligió. */
export const Revisita: Story = {
  args: { initialCounts: { '5': 3, '11': 1 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Las filas entran con `.signup-pop` (arranca en opacidad 0): se espera a que termine.
    await waitFor(() =>
      expect(within(canvas.getByRole('group', { name: /fútbol 5/i })).getByText('3')).toBeVisible(),
    )
    await waitFor(() =>
      expect(
        within(canvas.getByRole('group', { name: /fútbol 11/i })).getByText('1'),
      ).toBeVisible(),
    )
  },
}
