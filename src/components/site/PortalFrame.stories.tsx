import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import type { PortalSession } from '@/modules/players/portal-session'
import { PortalWorld } from '@/components/world/PortalWorld'
import { PortalSessionProvider } from './PortalSessionProvider'
import PortalFrame from './PortalFrame'
import PortalHeader from './PortalHeader'
import SiteFooter from './SiteFooter'

const SESSION: PortalSession = {
  playerId: 'p1',
  firstName: 'Tomás',
  lastName: 'Ibáñez',
  avatarUrl: null,
  email: 'tomas.ibanez@example.com',
}

/**
 * El cromo completo del portal: barra, pie y —con sesión de jugador— la barra inferior. Es el
 * armado de `PortalShell` sin su Provider (la sesión se siembra con `initialValue`, sin fetch a
 * /api/player/session). El cromo usa solo tokens semánticos: las stories `*Mundo` lo miran con
 * los del portal (`PortalWorld`) además de con los del panel, que es lo que ven hoy las
 * páginas sin migrar.
 */
const meta = {
  title: 'Player/PortalFrame',
  component: PortalFrame,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile-primary' },
    nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } },
  },
  args: {
    header: <PortalHeader variant="solid" signOutAction={fn(async () => {})} />,
    footer: <SiteFooter />,
    children: <div className="p-6 text-sm text-foreground">Contenido de la página</div>,
  },
} satisfies Meta<typeof PortalFrame>

export default meta
type Story = StoryObj<typeof meta>

function conSesion(
  session: PortalSession | null,
  staffPanelPath: string | null = null,
  mundo = false,
): Decorator[] {
  return [
    (Story) => {
      const marco = (
        <PortalSessionProvider
          initialValue={{ session, favoriteTenantIds: new Set(), staffPanelPath }}
        >
          <Story />
        </PortalSessionProvider>
      )
      return mundo ? <PortalWorld>{marco}</PortalWorld> : marco
    },
  ]
}

const sinBarraInferior = async (canvasElement: HTMLElement) =>
  expect(
    within(canvasElement).queryByRole('navigation', { name: 'Navegación del jugador' }),
  ).not.toBeInTheDocument()

// El pie termina justo donde empieza la barra inferior: sin franja de fondo entre los dos.
const conBarraInferior = async (canvasElement: HTMLElement) => {
  const nav = within(canvasElement).getByRole('navigation', { name: 'Navegación del jugador' })
  await expect(nav).toBeVisible()
  window.scrollTo(0, document.documentElement.scrollHeight)
  const pie = canvasElement.querySelector('footer')!.getBoundingClientRect()
  await expect(Math.abs(nav.getBoundingClientRect().top - pie.bottom)).toBeLessThan(0.5)
}

/** Sesión anónima: sin bottom-nav, sin padding inferior extra. */
export const SinSesion: Story = {
  decorators: conSesion(null),
  play: async ({ canvasElement }) => sinBarraInferior(canvasElement),
}

export const SinSesionMundo: Story = {
  decorators: conSesion(null, null, true),
  play: async ({ canvasElement }) => sinBarraInferior(canvasElement),
}

/** Jugador logueado: aparece el bottom-nav mobile + padding inferior (safe-area). */
export const ConSesion: Story = {
  decorators: conSesion(SESSION),
  play: async ({ canvasElement }) => conBarraInferior(canvasElement),
}

export const ConSesionMundo: Story = {
  decorators: conSesion(SESSION, null, true),
  play: async ({ canvasElement }) => conBarraInferior(canvasElement),
}

/** Un complejo con la sesión abierta en una página pública: "Ir a mi panel", sin bottom-nav. */
export const ComplejoLogueado: Story = {
  decorators: conSesion(null, '/dashboard'),
  play: async ({ canvasElement }) => {
    await sinBarraInferior(canvasElement)
    await expect(
      within(canvasElement).getByRole('link', { name: 'Ir a mi panel' }),
    ).toBeInTheDocument()
  },
}
