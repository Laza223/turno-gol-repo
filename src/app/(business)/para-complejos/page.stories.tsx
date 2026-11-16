import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import BusinessLayout from '../layout'
import ParaComplejosPage from './page'

/**
 * Página 100% estática (sin fetch/auth) — landing B2B en vidrio: sigue el tema
 * del visitante (el layout pone el marcador `data-portal-glass`, el fondo y la
 * cabecera). Montamos el `BusinessLayout` real (no una copia) para que el
 * contraste y el espaciado del fold se vean representativos en claro y oscuro.
 */
const meta = {
  title: 'Public/ParaComplejos',
  component: ParaComplejosPage,
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <BusinessLayout>
        <Story />
      </BusinessLayout>
    ),
  ],
} satisfies Meta<typeof ParaComplejosPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(
      /chau cuaderno,\s*chau whatsapp\./i,
    )
    // "Probalo 30 días" está en el hero y en el cierre: los dos van a /register.
    const trials = canvas.getAllByRole('link', { name: /probalo 30 días/i })
    await expect(trials).toHaveLength(2)
    for (const cta of trials) await expect(cta).toHaveAttribute('href', '/register')
    // El CTA de WhatsApp abre el chat comercial en otra pestaña, con el mensaje cargado.
    for (const wa of canvas.getAllByRole('link', { name: /escribinos por whatsapp/i })) {
      await expect(wa).toHaveAttribute(
        'href',
        expect.stringMatching(/^https:\/\/wa\.me\/\d+\?text=/),
      )
      await expect(wa).toHaveAttribute('target', '_blank')
    }
    await expect(canvas.getByRole('heading', { name: '¿Te suena?' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /ver precios/i })).toHaveAttribute(
      'href',
      '/precios',
    )
  },
}
