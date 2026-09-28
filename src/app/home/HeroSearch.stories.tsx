import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { NearbyProvider } from './nearby-context'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import { cityCounts, publicTenantCard } from '@/test/fixtures/tenant'
import HeroSearch from './HeroSearch'

const meta = {
  title: 'Public/HeroSearch',
  component: HeroSearch,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
  },
  args: { cities: cityCounts() },
  decorators: [
    (Story) => (
      <div className="max-w-[545px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeroSearch>

export default meta
type Story = StoryObj<typeof meta>

/** Sin ubicación todavía: la zona queda vacía y el día arranca en "Hoy". */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Día' })).toHaveTextContent('Hoy')
    await expect(canvas.getByRole('button', { name: 'Hora' })).toHaveTextContent('Cualquiera')
  },
}

/**
 * Zona sugerida por la geolocalización del hero (`NearbyProvider`): la
 * localidad del complejo más cercano, mientras el usuario no toque el campo.
 */
export const ZonaSugerida: Story = {
  decorators: [
    (Story) => (
      <NearbyProvider>
        <Story />
      </NearbyProvider>
    ),
    withGeolocation('found'),
  ],
  parameters: {
    fetchMock: [
      {
        match: '/api/public/search',
        json: {
          results: [
            publicTenantCard({ city: 'La Plata', province: 'Buenos Aires', distanceKm: 8 }),
          ],
          total: 1,
        },
      },
      { match: '/api/public/availability', json: { date: '2026-09-27', courts: [] } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByRole('combobox', { name: 'Zona' })).toHaveValue('La Plata, Buenos Aires'),
    )
  },
}

/** Elegir una hora del menú reemplaza "Cualquiera". */
export const SeleccionaHora: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El <label htmlFor="hero-time"> ("Hora") gana la accessible-name computation
    // sobre el texto visible del botón.
    await userEvent.click(canvas.getByRole('button', { name: 'Hora' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('menuitem', { name: '19:00' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Hora' })).toHaveTextContent('19:00'),
    )
  },
}

/** El día se elige de una lista corta (hoy y los seis que siguen), sin tipear una fecha. */
export const SeleccionaDia: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Día' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('menuitem', { name: 'Mañana' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Día' })).toHaveTextContent('Mañana'),
    )
  },
}
