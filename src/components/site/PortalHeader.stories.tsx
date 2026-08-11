import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import type { PortalSession } from '@/modules/players/portal-session'
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
 */
const meta = {
  title: 'Player/PortalHeader',
  component: PortalHeader,
  parameters: { layout: 'fullscreen' },
  args: { signOutAction: fn(async () => {}) },
} satisfies Meta<typeof PortalHeader>

export default meta
type Story = StoryObj<typeof meta>

function withSession(session: PortalSession | null): Decorator[] {
  return [
    (Story) => (
      <div
        style={{ transform: 'translateZ(0)', height: 110 }}
        className="relative isolate overflow-hidden"
      >
        <PortalSessionProvider initialValue={{ session, favoriteTenantIds: new Set() }}>
          <Story />
        </PortalSessionProvider>
      </div>
    ),
  ]
}

export const OverlayDeslogueado: Story = {
  args: { variant: 'overlay' },
  decorators: withSession(null),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ingresar' })).toBeInTheDocument()
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

export const SolidDeslogueado: Story = {
  args: { variant: 'solid' },
  decorators: withSession(null),
}

export const SolidLogueado: Story = {
  args: { variant: 'solid' },
  decorators: withSession(SESSION),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: /mis reservas/i })).toBeInTheDocument()
  },
}
