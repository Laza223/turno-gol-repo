import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import type { PortalSession } from '@/modules/players/portal-session'
import { PortalWorld } from '@/components/world/PortalWorld'
import { PortalSessionProvider } from './PortalSessionProvider'
import PortalHeader from './PortalHeader'

const SESSION: PortalSession = {
  playerId: 'p1',
  firstName: 'Tomás',
  lastName: 'Ibáñez',
  avatarUrl: null,
  email: 'tomas.ibanez@example.com',
}

/**
 * `usePortalSession` decide CTA "Ingresar" vs `AccountMenu` — se siembra con
 * `PortalSessionProvider initialValue=` (ver el comentario en
 * PortalSessionProvider.tsx), sin depender de un fetch real. `fixed top-0`:
 * se fuerza un containing block nuevo (`transform`) para no tapar el canvas.
 * La página actual para el `next` de "Ingresar" sale de `parameters.nextjs.navigation`.
 * La barra `solid` usa solo tokens semánticos: las stories `*Mundo` la miran con los
 * del portal (`PortalWorld`) además de con los del panel.
 */
const meta = {
  title: 'Player/PortalHeader',
  component: PortalHeader,
  parameters: { layout: 'fullscreen' },
  args: { signOutAction: fn(async () => {}) },
} satisfies Meta<typeof PortalHeader>

export default meta
type Story = StoryObj<typeof meta>

function withSession(
  session: PortalSession | null,
  staffPanelPath: string | null = null,
  mundo = false,
): Decorator[] {
  return [
    (Story) => {
      const barra = (
        <div
          style={{ transform: 'translateZ(0)', height: 110 }}
          className="relative isolate overflow-hidden"
        >
          <PortalSessionProvider
            initialValue={{ session, favoriteTenantIds: new Set(), staffPanelPath }}
          >
            <Story />
          </PortalSessionProvider>
        </div>
      )
      return mundo ? <PortalWorld>{barra}</PortalWorld> : barra
    },
  ]
}

const EN_EXPLORAR = {
  nextjs: {
    appDirectory: true,
    navigation: { pathname: '/explorar', query: { city: 'rosario' } },
  },
}
const NEXT_EXPLORAR = '/ingresar?next=%2Fexplorar%3Fcity%3Drosario'

/** Alto del blanco táctil: WCAG 2.5.5 pide 44 px en todos los anchos del cromo. */
const alto = (el: HTMLElement) => el.getBoundingClientRect().height

export const OverlayDeslogueado: Story = {
  args: { variant: 'overlay' },
  decorators: withSession(null),
  parameters: EN_EXPLORAR,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ingresar' })).toHaveAttribute(
      'href',
      NEXT_EXPLORAR,
    )
  },
}

export const OverlayLogueado: Story = {
  args: { variant: 'overlay' },
  decorators: withSession(SESSION),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Cuenta de Tomás' })).toBeInTheDocument()
  },
}

/** El cromo plano: 56 px, línea de 1 px abajo, "Ingresar" verde que vuelve a esta página. */
export const SolidDeslogueado: Story = {
  args: { variant: 'solid' },
  decorators: withSession(null),
  parameters: EN_EXPLORAR,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ingresar = canvas.getByRole('link', { name: 'Ingresar' })
    await expect(ingresar).toHaveAttribute('href', NEXT_EXPLORAR)
    await expect(alto(ingresar)).toBeGreaterThanOrEqual(44)
    await expect(alto(canvas.getByRole('link', { name: 'Explorar' }))).toBeGreaterThanOrEqual(44)
    await expect(alto(canvas.getByRole('banner'))).toBe(56)
  },
}

export const SolidDeslogueadoMundo: Story = {
  ...SolidDeslogueado,
  decorators: withSession(null, null, true),
}

export const SolidLogueado: Story = {
  args: { variant: 'solid' },
  decorators: withSession(SESSION),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: /mis reservas/i })).toBeInTheDocument()
    await expect(
      alto(canvas.getByRole('button', { name: 'Cuenta de Tomás' })),
    ).toBeGreaterThanOrEqual(44)
  },
}

export const SolidLogueadoMundo: Story = {
  ...SolidLogueado,
  decorators: withSession(SESSION, null, true),
}

/**
 * Un COMPLEJO con la sesión abierta que cae en una página pública. Antes veía
 * "Ingresar", entraba, y el login lo devolvía acá mismo. Ahora tiene el camino
 * directo a su panel.
 */
export const OverlayComplejoLogueado: Story = {
  args: { variant: 'overlay' },
  decorators: withSession(null, '/dashboard'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ir a mi panel' })).toBeInTheDocument()
  },
}

export const SolidComplejoLogueado: Story = {
  args: { variant: 'solid' },
  decorators: withSession(null, '/dashboard'),
  parameters: EN_EXPLORAR,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // "Ir a mi panel" no lleva `next`: el panel no vuelve a la página pública.
    await expect(canvas.getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  },
}

export const SolidComplejoLogueadoMundo: Story = {
  ...SolidComplejoLogueado,
  decorators: withSession(null, '/dashboard', true),
}
