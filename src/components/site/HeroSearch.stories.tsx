import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { cityCounts } from '@/test/fixtures/tenant'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import HeroSearch from './HeroSearch'

const meta = {
  title: 'Public/HeroSearch',
  component: HeroSearch,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
  },
  args: { cities: cityCounts() },
} satisfies Meta<typeof HeroSearch>

export default meta
type Story = StoryObj<typeof meta>

/** Layout horizontal (landing) — geolocalización todavía resolviendo, sin mensaje. */
export const Horizontal: Story = {
  decorators: [withGeolocation('pending')],
}

/** Layout vertical (banda de /explorar). */
export const Vertical: Story = {
  args: { layout: 'vertical' },
  decorators: [withGeolocation('pending')],
}

/** Ciudad sugerida por geolocalización — mensaje "Localidad sugerida". */
export const CiudadPrefillada: Story = {
  decorators: [withGeolocation('found')],
  parameters: {
    fetchMock: [
      {
        match: '/api/public/search',
        json: { results: [{ city: 'La Plata', province: 'Buenos Aires', distanceKm: 8 }] },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByText('Localidad sugerida según tu ubicación.')).toBeInTheDocument(),
    )
  },
}

/** Geolocalización denegada — mensaje de error, el campo queda vacío. */
export const GeolocalizacionDenegada: Story = {
  decorators: [withGeolocation('denied')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(
        canvas.getByText('No pudimos acceder a tu ubicación. Elegí tu localidad manualmente.'),
      ).toBeInTheDocument(),
    )
  },
}

/** Elegir una hora del dropdown — reemplaza "Cualquier horario". */
export const SeleccionaHora: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El <label htmlFor="hero-time"> ("Hora") gana la accessible-name computation
    // sobre el texto visible del botón ("Cualquier horario" / la hora elegida).
    await userEvent.click(canvas.getByRole('button', { name: 'Hora' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('menuitem', { name: '19:00' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Hora' })).toHaveTextContent('19:00'),
    )
  },
}

/** El día se elige entre hoy y los 6 siguientes (7 opciones), no con un calendario libre. */
export const SeleccionaDia: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Fecha' }))
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findAllByRole('menuitem')).toHaveLength(7)
    await userEvent.click(body.getByRole('menuitem', { name: 'Mañana' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Fecha' })).toHaveTextContent('Mañana'),
    )
  },
}

/** No hay campo de club (eso vive en /explorar); el submit manda solo lo elegido. */
export const Buscar: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByPlaceholderText('¿Qué club buscás?')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Buscar canchas' }))
    await expect(getRouter().push).toHaveBeenCalledWith('/explorar')
  },
}
