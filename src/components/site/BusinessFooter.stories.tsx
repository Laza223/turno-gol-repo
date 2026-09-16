import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import BusinessFooter from './BusinessFooter'
import {
  CONTACT_EMAIL,
  CONTACT_INSTAGRAM_HANDLE,
  CONTACT_WHATSAPP_DISPLAY,
  contactInstagramUrl,
  contactMailtoUrl,
  contactWhatsappUrl,
} from '@/lib/contact'

/**
 * Fondo `#020617` hardcodeado — superficie SIEMPRE oscura (landing B2B
 * `/para-complejos`), independiente del theme del viewer. No hay estados: es
 * estático.
 *
 * El shell real (src/app/(business)/layout.tsx) envuelve TODO en
 * `className="dark"` — sin eso, `dark:text-emerald-400` del Logo no aplica
 * cuando el theme del viewer es claro (default) y "Gol" queda en
 * `text-emerald-700` sobre #020617 → 3.67:1, bajo AA. Reproducir el wrapper acá.
 */
const meta = {
  title: 'Public/BusinessFooter',
  component: BusinessFooter,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="dark" style={{ background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BusinessFooter>

export default meta
type Story = StoryObj<typeof meta>

/** Mismos tres canales que el pie del portal, en el clima oscuro fijo. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: `WhatsApp ${CONTACT_WHATSAPP_DISPLAY}` }),
    ).toHaveAttribute('href', contactWhatsappUrl())
    await expect(
      canvas.getByRole('link', { name: `Instagram @${CONTACT_INSTAGRAM_HANDLE}` }),
    ).toHaveAttribute('href', contactInstagramUrl())
    await expect(canvas.getByRole('link', { name: `Mail ${CONTACT_EMAIL}` })).toHaveAttribute(
      'href',
      contactMailtoUrl(),
    )
    await expect(canvas.queryByRole('link', { name: 'Contacto' })).toBeNull()
  },
}
