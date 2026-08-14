import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import { ScrollTabs, type ScrollTab } from './scroll-tabs'

const SETTINGS_TABS: ScrollTab[] = [
  { href: '/settings/perfil', label: 'Perfil' },
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
]

/**
 * Tab bar de `<a>` nativos (full reload a propósito, no `next/link`) — el
 * caso real es `/settings/*` (SettingsTabs.tsx). Se reproduce ese mismo set
 * de tabs para que el estado activo se vea con datos reales del dominio.
 */
const meta = {
  title: 'Patterns/ScrollTabs',
  component: ScrollTabs,
  parameters: { layout: 'padded' },
  args: {
    tabs: SETTINGS_TABS,
    activeHref: '/settings/reservas',
    ariaLabel: 'Secciones de configuración',
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScrollTabs>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const PrimerTabActivo: Story = { args: { activeHref: '/settings/perfil' } }

/**
 * Muchos tabs en un contenedor angosto: scroll horizontal propio, la página
 * nunca desborda. MEJORA-UX QA: el tab activo es el ÚLTIMO — sin el
 * `scrollIntoView` al montar, la tira arrancaba con `scrollLeft:0` y
 * "Integraciones" quedaba fuera de vista pese a `aria-current="page"`.
 */
export const Overflow: Story = {
  args: {
    tabs: [
      ...SETTINGS_TABS,
      { href: '/settings/equipo', label: 'Equipo' },
      { href: '/settings/notificaciones', label: 'Notificaciones' },
      { href: '/settings/integraciones', label: 'Integraciones' },
    ],
    activeHref: '/settings/integraciones',
  },
  decorators: [
    (Story) => (
      <div className="max-w-xs">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = canvas.getByRole('navigation')
    await waitFor(() => expect(nav.scrollLeft).toBeGreaterThan(0))
    await expect(canvas.getByText('Integraciones')).toBeVisible()
  },
}
