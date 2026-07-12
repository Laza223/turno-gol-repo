import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import BusinessLayout from '../layout'
import PreciosPage from './page'

/**
 * Página estática (sin fetch/auth) — compone PlanSelector y CalculadoraClavo
 * ('use client', ya storyadas por separado), un FAQ con `<details>` nativo y
 * JSON-LD estático. Siempre superficie oscura (`(business)/layout.tsx`, clase
 * `dark` a mano). Montamos el `BusinessLayout` real, no una copia.
 */
const meta = {
  title: 'Public/Precios',
  component: PreciosPage,
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [(Story) => <BusinessLayout><Story /></BusinessLayout>],
} satisfies Meta<typeof PreciosPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(/lo que te deja un turno/i)
    await expect(canvas.getByRole('heading', { name: 'Complejo' })).toBeInTheDocument()
  },
}

/** El accordion de FAQ usa `<details>/<summary>` nativo: abrir uno no cierra los demás. */
export const FaqAbierta: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const question = canvas.getByText('¿Mis clientes tienen que bajarse una app?')
    await expect(canvas.queryByText(/reservan desde un link/i)).not.toBeVisible()
    await userEvent.click(question)
    await expect(canvas.getByText(/reservan desde un link/i)).toBeVisible()
  },
}
