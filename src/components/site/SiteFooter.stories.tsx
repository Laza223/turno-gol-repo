import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import SiteFooter from './SiteFooter'
import {
  CONTACT_EMAIL,
  CONTACT_INSTAGRAM_HANDLE,
  CONTACT_WHATSAPP_DISPLAY,
  contactInstagramUrl,
  contactMailtoUrl,
  contactWhatsappUrl,
} from '@/lib/contact'

/** Footer del portal del jugador — theme-adaptive vía tokens, estático. */
const meta = {
  title: 'Player/SiteFooter',
  component: SiteFooter,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SiteFooter>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Los tres canales de contacto reemplazaron al link "Contacto" (un `mailto:`
 * suelto). El assert mira los `href` contra los helpers y no contra literales:
 * si mañana cambia el número, la story no tiene que enterarse.
 */
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
    // El link viejo se fue: si vuelve, es que alguien deshizo el grupo.
    await expect(canvas.queryByRole('link', { name: 'Contacto' })).toBeNull()
  },
}
