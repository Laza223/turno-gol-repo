import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { PortalSession } from '@/modules/players/portal-session'
import { PortalSessionProvider } from './PortalSessionProvider'
import PortalFrame from './PortalFrame'

const SESSION: PortalSession = {
  playerId: 'p1',
  firstName: 'Tomás',
  lastName: 'Ibáñez',
  avatarUrl: null,
  email: 'tomas.ibanez@example.com',
}

const Header = () => (
  <header className="border-b border-border bg-card px-4 py-3 text-sm font-semibold text-foreground">
    Header (placeholder)
  </header>
)
const Footer = () => (
  <footer className="border-t border-border bg-card px-4 py-3 text-xs text-muted-foreground">
    Footer (placeholder)
  </footer>
)

/**
 * El bottom-nav mobile y su padding inferior van SIEMPRE, con o sin sesión: sin sesión,
 * Reservas y Cuenta redirigen a /ingresar?next=… por el guard de cada página. Se siembra la
 * sesión con `PortalSessionProvider initialValue=` (ver el comentario en
 * PortalSessionProvider.tsx) para no depender de un fetch real a /api/player/session.
 */
const meta = {
  title: 'Player/PortalFrame',
  component: PortalFrame,
  parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'mobile-primary' } },
  args: {
    header: <Header />,
    footer: <Footer />,
    children: <div className="p-6 text-sm text-foreground">Contenido de la página</div>,
  },
} satisfies Meta<typeof PortalFrame>

export default meta
type Story = StoryObj<typeof meta>

/** Sesión anónima: el bottom-nav mobile aparece igual. */
export const SinSesion: Story = {
  decorators: [
    (Story) => (
      <PortalSessionProvider
        initialValue={{ session: null, favoriteTenantIds: new Set(), staffPanelPath: null }}
      >
        <Story />
      </PortalSessionProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('navigation', { name: 'Navegación del jugador' })).toBeVisible()
  },
}

/** Jugador logueado: aparece el bottom-nav mobile + padding inferior (safe-area). */
export const ConSesion: Story = {
  decorators: [
    (Story) => (
      <PortalSessionProvider
        initialValue={{ session: SESSION, favoriteTenantIds: new Set(), staffPanelPath: null }}
      >
        <Story />
      </PortalSessionProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('navigation', { name: 'Navegación del jugador' })).toBeVisible()
  },
}
