import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { WizardActionResult } from '../actions'
import { StepHorarios } from './StepHorarios'

const meta = {
  title: 'Onboarding/StepHorarios',
  component: StepHorarios,
  parameters: { layout: 'fullscreen' },
  args: {
    action: fn(async (): Promise<WizardActionResult> => ({
      success: true,
      next: '/onboarding/precios',
    })),
  },
} satisfies Meta<typeof StepHorarios>

export default meta
type Story = StoryObj<typeof meta>

/** De 08 a 00 (medianoche) de entrada: "Siguiente" sin tocar nada es válido. */
export const PorDefecto: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: '¿A qué hora abrís y cerrás?' })).toBeVisible()
    await expect(canvas.getByText('Si un día es distinto, lo cambiás después.')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /abrís a las/i })).toHaveTextContent('08:00')
    await expect(canvas.getByRole('button', { name: /cerrás a las/i })).toHaveTextContent(
      '00:00 (medianoche)',
    )

    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(args.action).toHaveBeenCalledWith({ openHour: 8, closeHour: 0 }))
  },
}

/** Cierre de madrugada: viaja como hora entera. */
export const CierraDeMadrugada: Story = {
  args: { initialOpenHour: 10, initialCloseHour: 2 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /cerrás a las/i })).toHaveTextContent(
      '02:00 (de la madrugada)',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(args.action).toHaveBeenCalledWith({ openHour: 10, closeHour: 2 }))
  },
}

/** El server rechaza: el error se ve arriba del botón. */
export const ErrorDelServer: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'Horarios inválidos.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Horarios inválidos.')
  },
}
