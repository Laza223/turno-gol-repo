import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import { cityCounts, publicTenantCard } from '@/test/fixtures/tenant'
import { availabilityResponse, slot, todayArt } from '@/test/fixtures/public'
import { Hero } from './Hero'

/**
 * `page.tsx` (HomePage) envuelve todas las secciones de la landing en
 * `<div className="landing-hero min-h-dvh text-foreground">` — esa clase es la
 * que pinta el fondo claro / el navy #020617 oscuro. Reproducirlo acá no es
 * decoración: sin él el hero se ve sobre `bg-background` y el contraste medido
 * no es el real.
 *
 * Datos de demo (sintéticos): nombres, distancias y turnos son de mentira, y
 * las fotos son fondos de `public/` haciendo de la portada de cada complejo.
 */
const sanMartin = publicTenantCard({
  id: '00000000-0000-4000-8000-000000000a01',
  slug: 'complejo-san-martin',
  name: 'Complejo San Martín',
  city: 'Luján',
  province: 'Buenos Aires',
  coverUrl: '/bg-hero-2.png',
  fromPriceCents: 6000000,
  distanceKm: 4.2,
  courtFormats: [5, 7],
})
const laCortada = publicTenantCard({
  id: '00000000-0000-4000-8000-000000000a02',
  slug: 'la-cortada-f5',
  name: 'La Cortada F5',
  city: 'Luján',
  province: 'Buenos Aires',
  coverUrl: '/hero-bg.png',
  distanceKm: 7.8,
  courtFormats: [5],
})
const clubEstacion = publicTenantCard({
  id: '00000000-0000-4000-8000-000000000a03',
  slug: 'club-estacion',
  name: 'Club Estación',
  city: 'General Rodríguez',
  province: 'Buenos Aires',
  coverUrl: '/bg-owner.png',
  distanceKm: 11,
  courtFormats: [7],
})

const dayOf = (free: string[]) =>
  availabilityResponse({
    date: todayArt(),
    courts: [
      {
        ...availabilityResponse().courts[0]!,
        slots: ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'].map((time) =>
          slot({ time, status: free.includes(time) ? 'free' : 'occupied' }),
        ),
      },
    ],
  })

const foundRoutes = [
  {
    match: '/api/public/search',
    json: { results: [sanMartin, laCortada, clubEstacion], total: 3 },
  },
  { match: 'slug=complejo-san-martin', json: dayOf(['19:00', '20:00', '22:00', '23:00']) },
  { match: 'slug=la-cortada-f5', json: dayOf(['21:00']) },
  { match: 'slug=club-estacion', json: dayOf(['21:00', '22:00']) },
]

const meta = {
  title: 'Public/Landing/Hero',
  component: Hero,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
  },
  args: { cities: cityCounts() },
  decorators: [
    (Story) => (
      <div className="landing-hero min-h-dvh text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Hero>

export default meta
type Story = StoryObj<typeof meta>

/** Con ubicación: la cancha más cerca con sus turnos libres de hoy y las dos que siguen. */
export const CanchasCerca: Story = {
  decorators: [withGeolocation('found')],
  parameters: { fetchMock: foundRoutes },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('a 4 km.'),
    )
    const pill = await canvas.findByRole('link', { name: 'Reservar hoy a las 19:00' })
    await expect(pill.getAttribute('href')).toContain('/complejo-san-martin/reservar?court=')
    await expect(
      canvas.getByRole('link', { name: 'Reservar hoy a las 21:00 en La Cortada F5' }),
    ).toBeInTheDocument()
  },
}

/** Esperando el permiso de ubicación: lo que sale en el HTML del servidor. */
export const BuscandoUbicacion: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('a un toque.')
    await expect(canvas.getByRole('button', { name: 'Usar mi ubicación' })).toBeInTheDocument()
  },
}

/** Permiso negado: el hero ofrece las zonas que existen (conteos reales de `listPublicCities`). */
export const SinPermiso: Story = {
  decorators: [withGeolocation('denied')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Sin tu ubicación no sabemos qué te queda cerca')
    await expect(
      canvas.getByRole('link', { name: /Ciudad Autónoma de Buenos Aires/ }),
    ).toBeInTheDocument()
  },
}

/** Nada a menos de 40 km: se dice, sin inventar "cerca". */
export const NadaCerca: Story = {
  decorators: [withGeolocation('found')],
  parameters: {
    fetchMock: [
      {
        match: '/api/public/search',
        json: {
          results: [publicTenantCard({ distanceKm: 1400, city: 'San Salvador de Jujuy' })],
          total: 1,
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Todavía no hay canchas en TurnoGol a menos de 40 km tuyo')
  },
}

/** Una sola cancha en la zona y sin turnos libres hoy. */
export const UnaSinTurnos: Story = {
  decorators: [withGeolocation('found')],
  parameters: {
    fetchMock: [
      { match: '/api/public/search', json: { results: [sanMartin], total: 1 } },
      { match: 'slug=complejo-san-martin', json: dayOf([]) },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(/Hoy no le quedan turnos libres/)
  },
}
