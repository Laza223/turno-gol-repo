import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import SiteFooter from './SiteFooter'
import { PortalSessionProvider } from './PortalSessionProvider'
import {
  CONTACT_EMAIL,
  CONTACT_INSTAGRAM_HANDLE,
  CONTACT_WHATSAPP_DISPLAY,
  contactInstagramUrl,
  contactMailtoUrl,
  contactWhatsappUrl,
} from '@/lib/contact'

/**
 * Pie del portal de vidrio: la palabra gigante, la marca y tres columnas, sobre la luz del portal.
 * "Rival, partidos abiertos" aparece solo con el flag. Es de servidor; el link de Rival lee el flag del
 * `PortalSessionProvider`.
 */
const meta = {
  title: 'Player/SiteFooter',
  component: SiteFooter,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass className="portal-ambient relative isolate pt-10">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SiteFooter>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Los tres canales de contacto y las tres columnas. Los `href` de contacto se comparan contra los
 * helpers y no contra literales: si mañana cambia el número, la story no tiene que enterarse.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const title of ['Jugadores', 'Complejos', 'Ayuda']) {
      await expect(canvas.getByRole('heading', { name: title })).toBeVisible()
    }
    for (const [name, href] of [
      ['Buscar canchas', '/explorar'],
      ['TurnoGol para complejos', '/para-complejos'],
      ['Precios', '/precios'],
      ['Blog', '/blog'],
      ['Términos', '/terminos'],
      ['Privacidad', '/privacidad'],
      ['Escribinos', contactWhatsappUrl()],
    ] as const) {
      await expect(canvas.getByRole('link', { name })).toHaveAttribute('href', href)
    }
    // Sin el flag no hay Rival, y el "Ingresar" del pie anterior ya no está.
    await expect(canvas.queryByRole('link', { name: 'Rival, partidos abiertos' })).toBeNull()
    await expect(canvas.queryByRole('link', { name: 'Ingresar' })).toBeNull()
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
  },
}

/** Con el flag de RIVAL prendido aparece "Rival, partidos abiertos" en Jugadores. */
export const ConRival: Story = {
  decorators: [
    (Story) => (
      <PortalSessionProvider
        initialValue={{
          session: null,
          favoriteTenantIds: new Set(),
          staffPanelPath: null,
          rivalEnabled: true,
        }}
      >
        <Story />
      </PortalSessionProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Rival, partidos abiertos' })).toHaveAttribute(
      'href',
      '/rival',
    )
  },
}

/** En el celu: la marca arriba a todo el ancho y las columnas de a dos, sin desbordar. */
export const Celu: Story = {
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument.documentElement
    await expect(doc.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}
