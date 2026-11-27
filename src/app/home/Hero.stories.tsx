import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import { ZONA_STORAGE_KEY } from '@/lib/zona-storage'
import { availabilityResponse } from '@/test/fixtures/public'
import { cityCounts, publicTenantCard } from '@/test/fixtures/tenant'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import { withHome } from '../../../.storybook/decorators/with-home'
import { Hero } from './Hero'

const clearZona = () => localStorage.removeItem(ZONA_STORAGE_KEY)

const CABA = { city: 'Ciudad Autónoma de Buenos Aires', province: 'CABA' }

const COMPLEJOS = [
  publicTenantCard({
    id: 'a',
    slug: 'la-canchita',
    name: 'La Canchita',
    coverUrl: '/bg-hero-2.webp',
  }),
  publicTenantCard({
    id: 'b',
    slug: 'basilica-f5',
    name: 'Basílica F5',
    coverUrl: '/bg-owner.webp',
  }),
  publicTenantCard({ id: 'c', slug: 'las-rosas', name: 'Las Rosas Fútbol', coverUrl: null }),
]

/**
 * El visitante llega desde CABA según su conexión (`/api/public/zona`). Va en todas las stories del
 * archivo: `useIpZona` guarda la respuesta a nivel de módulo, así que tiene que ser la misma.
 */
const ZONA_POR_IP = { match: '/api/public/zona', json: { zona: CABA } }

/**
 * El hero de la home (portal de vidrio, F2): la foto en capas, el titular, el buscador y la ventana
 * con los complejos reales de la localidad. Ningún precio llega a la home.
 */
const meta = {
  title: 'Public/Landing/Hero',
  component: Hero,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
    fetchMock: [
      ZONA_POR_IP,
      { match: '/api/public/search', json: { results: COMPLEJOS, total: 34 } },
      { match: '/api/public/availability', json: availabilityResponse() },
    ],
  },
  decorators: [withGeolocation('pending'), withHome],
  args: { cities: cityCounts() },
  beforeEach: () => {
    clearZona()
    return clearZona
  },
} satisfies Meta<typeof Hero>

export default meta
type Story = StoryObj<typeof meta>

/** En el celu: la localidad sale de la conexión y la ventana muestra sus complejos con horarios. */
export const Celu: Story = {
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Encontrá cancha libre hoy' }),
    ).toBeVisible()
    const ventana = await canvas.findByRole('region', {
      name: `Complejos de ${CABA.city} con sus horarios libres de hoy`,
    })
    await waitFor(() => expect(within(ventana).getAllByText('20:00').length).toBeGreaterThan(0))
    await expect(within(ventana).getByRole('link', { name: /La Canchita/ })).toHaveAttribute(
      'href',
      '/la-canchita',
    )
    // Los precios del complejo nunca llegan a la home.
    await expect(canvasElement.textContent).not.toContain('$')
    // En el celu la cabecera es solo el logo: la entrada del dueño va al pie del hero.
    const dueno = canvas.getByRole('link', { name: 'Sumalo a TurnoGol' })
    await expect(dueno).toHaveAttribute('href', '/para-complejos')
    await expect(dueno.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  },
}

/** En la compu: la ventana con sus tarjetas en fila; la línea del dueño no está (va en la cabecera). */
export const Compu: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ventana = await canvas.findByRole('region', { name: /^Complejos de / })
    await expect(within(ventana).getByText('34 complejos')).toBeVisible()
    await expect(canvas.queryByRole('link', { name: 'Sumalo a TurnoGol' })).toBeNull()
  },
}

/** Una localidad sin complejos con reserva online: la ventana no aparece (no se inventan datos). */
export const SinComplejosEnLaZona: Story = {
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  parameters: {
    fetchMock: [
      ZONA_POR_IP,
      {
        match: '/api/public/search',
        json: { results: [publicTenantCard({ id: 'x', allowOnlineBooking: false })], total: 1 },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: /^Zona: Ciudad Autónoma/ })).toBeVisible(),
    )
    await new Promise((r) => setTimeout(r, 200))
    await expect(canvas.queryByRole('region', { name: /^Complejos de / })).toBeNull()
  },
}

/**
 * `loadCities()` degrada a `[]` si `listPublicCities()` tira. Ya no deja el buscador vacío: la
 * localidad de la conexión vale aunque no figure en la lista (cualquier localidad del país sirve).
 */
export const SinCiudades: Story = {
  args: { cities: [] },
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: /^Zona: Ciudad Autónoma/ })).toBeVisible(),
    )
  },
}
