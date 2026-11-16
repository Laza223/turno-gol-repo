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
 * Portal de vidrio (F8): el pie va sin fondo propio, sobre la luz de fondo de la página, y sigue
 * el tema. El decorador reproduce el wrapper del layout de `(business)`: el marcador de vidrio y
 * `portal-ambient`. No hay estados: es estático.
 */
const meta = {
  title: 'Public/BusinessFooter',
  component: BusinessFooter,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass className="portal-ambient text-portal-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BusinessFooter>

export default meta
type Story = StoryObj<typeof meta>

/** Mismos tres canales que el pie del portal. */
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
