import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import { availabilityResponse, availabilityResponseNoSlots } from '@/test/fixtures/public'
import { publicTenantCard } from '@/test/fixtures/tenant'
import { withHome } from '../../../.storybook/decorators/with-home'
import { ComplexWindow } from './ComplexWindow'

const LUJAN = { city: 'Luján', province: 'Buenos Aires' }

const COMPLEJOS = [
  publicTenantCard({
    id: 'a',
    slug: 'la-canchita',
    name: 'La Canchita',
    city: 'Luján',
    coverUrl: '/bg-hero-2.webp',
  }),
  publicTenantCard({
    id: 'b',
    slug: 'basilica-f5',
    name: 'Basílica F5',
    city: 'Luján',
    coverUrl: '/bg-owner.webp',
  }),
  publicTenantCard({
    id: 'c',
    slug: 'las-rosas',
    name: 'Las Rosas Fútbol',
    city: 'Luján',
    coverUrl: '/hero-bg.webp',
    courtFormats: [5, 8],
  }),
  publicTenantCard({ id: 'd', slug: 'potrero-norte', name: 'Potrero Norte', city: 'Luján' }),
  // Sin reserva online: no entra en la ventana.
  publicTenantCard({ id: 'e', slug: 'el-galpon', name: 'El Galpón', allowOnlineBooking: false }),
]

/**
 * La ventana del hero: complejos reales de la localidad con sus próximos horarios libres de hoy.
 * Solo los que reservan online, primero los que tienen foto, hasta 4. Sin distancia ni precios.
 */
const meta = {
  title: 'Public/Landing/ComplexWindow',
  component: ComplexWindow,
  parameters: {
    layout: 'fullscreen',
    fetchMock: [
      { match: '/api/public/search', json: { results: COMPLEJOS, total: 6 } },
      { match: '/api/public/availability', json: availabilityResponse() },
    ],
  },
  decorators: [
    withHome,
    (Story) => (
      <div className="grid justify-items-center px-(--home-gut) py-10">
        <Story />
      </div>
    ),
  ],
  args: { zona: LUJAN },
} satisfies Meta<typeof ComplexWindow>

export default meta
type Story = StoryObj<typeof meta>

/** En el celu: dos tarjetas a la vista; las de reserva online solamente. */
export const Celu: Story = {
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ventana = await canvas.findByRole('region', {
      name: 'Complejos de Luján con sus horarios libres de hoy',
    })
    await waitFor(() => expect(within(ventana).getAllByText('20:00').length).toBeGreaterThan(0))
    // En el celu se ven dos; las otras dos aparecen con el ancho.
    await expect(within(ventana).getAllByRole('link')).toHaveLength(2)
    await expect(within(ventana).queryByText('El Galpón')).toBeNull()
    // El total de la localidad va solo desde la tablet: en el celu no entra en la barra.
    await expect(within(ventana).getByText('6 complejos')).not.toBeVisible()
    await expect(ventana.textContent).not.toContain('$')
  },
}

/** En la compu: las cuatro en fila, con el total de la localidad. */
export const Compu: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const ventana = await within(canvasElement).findByRole('region', { name: /^Complejos de / })
    await expect(within(ventana).getAllByRole('link')).toHaveLength(4)
    await expect(within(ventana).getByText('6 complejos')).toBeVisible()
  },
}

/** Un complejo sin horarios libres hoy lo dice, en vez de mostrar chips vacíos. */
export const SinHorariosHoy: Story = {
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  parameters: {
    fetchMock: [
      { match: '/api/public/search', json: { results: COMPLEJOS.slice(0, 2), total: 2 } },
      { match: '/api/public/availability', json: availabilityResponseNoSlots() },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getAllByText('Sin horarios libres hoy.').length).toBeGreaterThan(0),
    )
  },
}

/** Si la búsqueda falla, la ventana no aparece. */
export const ErrorDeRed: Story = {
  parameters: {
    fetchMock: [{ match: '/api/public/search', json: { error: 'boom' }, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    await new Promise((r) => setTimeout(r, 200))
    await expect(within(canvasElement).queryByRole('region', { name: /^Complejos de / })).toBeNull()
  },
}
