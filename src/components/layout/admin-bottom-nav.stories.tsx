import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AdminBottomNav } from './admin-bottom-nav'

/**
 * La barra es `fixed inset-x-0 bottom-0` y `lg:hidden`: se la encierra en una
 * caja con `transform` (containing block nuevo) y se fuerza el viewport mobile,
 * porque en el canvas ancho de Storybook estaría oculta por el breakpoint.
 */
const meta = {
  title: 'Admin/Layout/AdminBottomNav',
  component: AdminBottomNav,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile-primary' },
    nextjs: { appDirectory: true, navigation: { pathname: '/grilla' } },
  },
  decorators: [
    (Story) => (
      <div style={{ transform: 'translateZ(0)', height: 120 }} className="relative isolate overflow-hidden">
        <Story />
      </div>
    ),
  ],
  args: {
    onOpenMore: fn(),
    moreOpen: false,
  },
} satisfies Meta<typeof AdminBottomNav>

export default meta
type Story = StoryObj<typeof meta>

/** Dueño: los tres primeros espacios son Hoy · Grilla · Caja. */
export const RolAdmin: Story = {
  args: { staffRole: 'admin' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Hoy' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Grilla' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(canvas.getByRole('link', { name: 'Caja' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Más' })).toBeInTheDocument()
  },
}

/**
 * Encargado: sin "Hoy" (D5), el tercer acceso pasa a ser Clientes. No hay
 * ninguna lista aparte — sale solo del orden por frecuencia de `NAV_ITEMS`.
 */
export const RolManager: Story = {
  args: { staffRole: 'manager' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Hoy' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Grilla' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Caja' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Clientes' })).toBeInTheDocument()
  },
}

export const AbreElDrawer: Story = {
  args: { staffRole: 'admin' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Más' }))
    await expect(args.onOpenMore).toHaveBeenCalledOnce()
  },
}

/** `/reservas` es la pestaña Lista de Grilla: enciende Grilla, no un ítem propio. */
export const ReservasEnciendeGrilla: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/reservas' } } },
  args: { staffRole: 'admin' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Grilla' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  },
}
