import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import SiteFooter from './SiteFooter'
import {
  CONTACT_EMAIL,
  CONTACT_INSTAGRAM_HANDLE,
  CONTACT_WHATSAPP_DISPLAY,
  contactInstagramUrl,
  contactMailtoUrl,
  contactWhatsappUrl,
} from '@/lib/contact'

/**
 * Footer del portal del jugador — plano, theme-adaptive vía tokens, estático. "Ingresar" vuelve
 * a la página actual (`parameters.nextjs.navigation`). Solo usa tokens semánticos: `ConMundo` lo
 * mira con los del portal además de con los del panel.
 */
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
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/explorar', query: { city: 'rosario' } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ingresar' })).toHaveAttribute(
      'href',
      '/ingresar?next=%2Fexplorar%3Fcity%3Drosario',
    )
    // Navegación real, no texto corrido: 44 px de alto en todos los links y canales.
    for (const link of canvas.getAllByRole('link')) {
      await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
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

export const ConMundo: Story = {
  ...Default,
  decorators: [
    (Story) => (
      <PortalWorld>
        <Story />
      </PortalWorld>
    ),
  ],
}
