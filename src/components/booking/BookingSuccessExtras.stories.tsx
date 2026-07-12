import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, spyOn, userEvent, within } from 'storybook/test'
import { tenant } from '@/test/fixtures/tenant'
import ReservaDarkShell from './ReservaDarkShell'
import BookingSuccessExtras from './BookingSuccessExtras'

const t = tenant()

/**
 * Vive al final de la página de éxito, dentro de ReservaDarkShell. `hasGeo`
 * decide si se monta el mini-mapa (dynamic import, ssr:false, react-leaflet) —
 * con red bloqueada en el sandbox de test los tiles no cargan, pero el
 * `MapContainer` y su `aria-label` sí se montan (Leaflet no rompe sin red, solo
 * deja los tiles en blanco), así que la story sigue siendo representativa del
 * layout real.
 */
const meta = {
  title: 'Player/BookingSuccess/BookingSuccessExtras',
  component: BookingSuccessExtras,
  parameters: { layout: 'fullscreen' },
  args: {
    tenantName: t.name,
    courtName: 'Cancha 1',
    slug: t.slug,
    date: '2026-03-14',
    timeStart: '16:00',
    timeEnd: '17:00',
    address: t.address,
    city: t.city,
    latitude: null,
    longitude: null,
  },
  decorators: [
    (Story) => (
      <ReservaDarkShell>
        <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12">
          <Story />
        </div>
      </ReservaDarkShell>
    ),
  ],
} satisfies Meta<typeof BookingSuccessExtras>

export default meta
type Story = StoryObj<typeof meta>

/** hasGeo=false: solo los 3 botones, sin mini-mapa. */
export const SinUbicacion: Story = {}

/** hasGeo=true: agrega el mini-mapa arriba de los botones. */
export const ConUbicacion: Story = {
  args: { latitude: -34.6083, longitude: -58.4386 },
}

export const CompartirPorWhatsApp: Story = {
  name: 'Compartir abre wa.me con el mensaje armado',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const openSpy = spyOn(window, 'open').mockImplementation(() => null)
    await userEvent.click(canvas.getByRole('button', { name: 'Compartir' }))
    await expect(openSpy).toHaveBeenCalledOnce()
    const [url] = openSpy.mock.calls[0]!
    await expect(String(url)).toContain('https://wa.me/?text=')
    openSpy.mockRestore()
  },
}

export const ComoLlegar: Story = {
  name: 'El link "Cómo llegar" apunta a Google Maps',
  args: { latitude: -34.6083, longitude: -58.4386 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', { name: 'Cómo llegar' })
    await expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=-34.6083,-58.4386',
    )
  },
}
