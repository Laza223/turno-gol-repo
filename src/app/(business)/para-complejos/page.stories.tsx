import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import BusinessLayout from '../layout'
import ParaComplejosPage from './page'

/**
 * Página 100% estática (sin fetch/auth) — landing B2B, SIEMPRE superficie
 * oscura (`(business)/layout.tsx` fija `background:#020617` + clase `dark` a
 * mano, no es un tema conmutable). `emerald-400` sobre ese fondo es correcto.
 * Montamos el `BusinessLayout` real (no una copia) para que la clase `dark`,
 * el contraste y el espaciado del fold se vean representativos.
 */
const meta = {
  title: 'Public/ParaComplejos',
  component: ParaComplejosPage,
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [(Story) => <BusinessLayout><Story /></BusinessLayout>],
} satisfies Meta<typeof ParaComplejosPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(/tu complejo, siempre lleno/i)
    // "Empezar gratis" se repite en header/hero/CTA final/footer — todas deben ir a /register.
    const ctas = canvas.getAllByRole('link', { name: /empezar gratis/i })
    await expect(ctas.length).toBeGreaterThan(1)
    for (const cta of ctas) await expect(cta).toHaveAttribute('href', '/register')
    await expect(canvas.getByText('Reservas online 24/7')).toBeInTheDocument()
  },
}
