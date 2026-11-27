import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
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
 * Cabecera del portal de vidrio (decisión 2026-11-13). En el celu, solo el logo y el botón de tema;
 * en la compu, la píldora de vidrio con los links al centro y la cuenta a la derecha.
 * `usePortalSession` se siembra con `PortalSessionProvider initialValue=`, sin fetch real. Detrás
 * va una foto, para que el vidrio tenga algo que desenfocar. `transform` le da a la variante
 * `overlay` (fija) un containing block propio, así no tapa el canvas.
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
  { staffPanelPath = null, rivalEnabled = false, height = 140 } = {} as {
    staffPanelPath?: string | null
    rivalEnabled?: boolean
    height?: number
  },
): Decorator[] {
  return [
    (Story) => (
      <div
        data-portal-glass
        style={{ transform: 'translateZ(0)', height }}
        className="portal-ambient relative isolate"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- fondo de muestra, sin optimizar */}
        <img
          src="/bg-hero-desktop.webp"
          alt=""
          className="absolute inset-x-0 top-0 -z-10 h-[140px] w-full object-cover"
        />
        <PortalSessionProvider
          initialValue={{ session, favoriteTenantIds: new Set(), staffPanelPath, rivalEnabled }}
        >
          <Story />
        </PortalSessionProvider>
      </div>
    ),
  ]
}

const DESKTOP = { viewport: { value: 'desktop', isRotated: false } }
const CELU = { viewport: { value: 'mobile-primary', isRotated: false } }

/** En la compu: la píldora mide 60 px y cada link es un blanco de 44 px. */
async function expectPildora(canvasElement: HTMLElement) {
  const bar = canvasElement.querySelector<HTMLElement>('.portal-top__bar')!
  await expect(Math.round(bar.getBoundingClientRect().height)).toBe(60)
  const nav = within(canvasElement).getByRole('navigation', { name: 'Principal' })
  for (const link of within(nav).getAllByRole('link')) {
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  }
}

export const OverlayDeslogueado: Story = {
  args: { variant: 'overlay' },
  globals: DESKTOP,
  decorators: withSession(null),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ingresar' })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Para complejos' })).toBeVisible()
    await expectPildora(canvasElement)
  },
}

export const OverlayLogueado: Story = {
  args: { variant: 'overlay' },
  globals: DESKTOP,
  decorators: withSession(SESSION),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Cuenta de Tomás' })).toBeVisible()
  },
}

export const SolidDeslogueado: Story = {
  args: { variant: 'solid' },
  globals: DESKTOP,
  decorators: withSession(null),
}

/** Con sesión, en `/mis-reservas` y con Rival prendido: el link de la página actual queda marcado. */
export const SolidLogueado: Story = {
  args: { variant: 'solid' },
  globals: DESKTOP,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } } },
  decorators: withSession(SESSION, { rivalEnabled: true }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Mis reservas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(canvas.getByRole('link', { name: 'Rival' })).toBeVisible()
    await expectPildora(canvasElement)
  },
}

/** Un COMPLEJO con la sesión abierta que cae en una página pública: el camino directo a su panel. */
export const OverlayComplejoLogueado: Story = {
  args: { variant: 'overlay' },
  globals: DESKTOP,
  decorators: withSession(null, { staffPanelPath: '/dashboard' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ir a mi panel' })).toBeVisible()
  },
}

export const SolidComplejoLogueado: Story = {
  args: { variant: 'solid' },
  globals: DESKTOP,
  decorators: withSession(null, { staffPanelPath: '/dashboard' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ir a mi panel' })).toBeVisible()
  },
}

/** En el celu: el logo y el botón de tema. La navegación es la barra de abajo. */
export const CeluDeslogueado: Story = {
  args: { variant: 'solid' },
  globals: CELU,
  decorators: withSession(null),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'TurnoGol, inicio' })).toBeVisible()
    const theme = canvas.getByRole('button', { name: /cambiar a tema/i })
    await expect(theme).toBeVisible()
    await expect(theme.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
    await expect(canvas.queryByRole('link', { name: 'Ingresar' })).toBeNull()
    await expect(canvas.queryByRole('navigation', { name: 'Principal' })).toBeNull()
  },
}

/** El complejo en el celu no tiene barra de abajo: "Ir a mi panel" queda a la vista, sin pisar el logo. */
export const CeluComplejoLogueado: Story = {
  args: { variant: 'solid' },
  globals: CELU,
  decorators: withSession(null, { staffPanelPath: '/dashboard' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = canvas.getByRole('link', { name: 'Ir a mi panel' })
    const logo = canvas.getByRole('link', { name: 'TurnoGol, inicio' })
    await expect(panel).toBeVisible()
    await expect(logo.getBoundingClientRect().right).toBeLessThanOrEqual(
      panel.getBoundingClientRect().left,
    )
  },
}

/** Pasados los 8 px de scroll la píldora se condensa una vez y vuelve al subir. */
export const Condensada: Story = {
  args: { variant: 'solid' },
  globals: DESKTOP,
  decorators: withSession(null, { height: 1600 }),
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector<HTMLElement>('.portal-top')!
    await expect(header).not.toHaveAttribute('data-condensed')
    window.scrollTo({ top: 200, behavior: 'instant' })
    await waitFor(() => expect(header).toHaveAttribute('data-condensed'))
    window.scrollTo({ top: 0, behavior: 'instant' })
    await waitFor(() => expect(header).not.toHaveAttribute('data-condensed'))
  },
}
