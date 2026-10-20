import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import PortalShell from '@/components/site/PortalShell'
import { OwnersStrip } from './OwnersStrip'
import { PortalWorld } from '@/components/world/PortalWorld'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import { cityCounts, publicTenantCard } from '@/test/fixtures/tenant'
import { availabilityResponse, slot, todayArt } from '@/test/fixtures/public'
import { Hero } from './Hero'

const complejos = [
  publicTenantCard({
    id: '00000000-0000-4000-8000-000000000b01',
    slug: 'complejo-san-martin',
    name: 'Complejo San Martín',
    city: 'Luján',
    coverUrl: '/bg-hero-2.png',
    fromPriceCents: 6000000,
    distanceKm: 4.2,
    courtFormats: [5, 7],
  }),
  publicTenantCard({
    id: '00000000-0000-4000-8000-000000000b02',
    slug: 'la-cortada-f5',
    name: 'La Cortada F5',
    city: 'Luján',
    coverUrl: '/hero-bg.png',
    distanceKm: 7.8,
    courtFormats: [5],
  }),
  publicTenantCard({
    id: '00000000-0000-4000-8000-000000000b03',
    slug: 'club-estacion',
    name: 'Club Estación',
    city: 'General Rodríguez',
    coverUrl: '/bg-owner.png',
    distanceKm: 11,
    courtFormats: [7],
  }),
]

const dia = availabilityResponse({
  date: todayArt(),
  courts: [
    {
      ...availabilityResponse().courts[0]!,
      slots: ['18:00', '19:00', '20:00', '21:00', '22:00'].map((time) =>
        slot({ time, status: 'free' }),
      ),
    },
  ],
})

/**
 * La home entera como la arma `page.tsx` (`PortalShell` + `Hero` + `OwnersStrip` en
 * `PortalWorld`), a 390 px de ancho (el celular de referencia). Es la que mide el primer
 * viewport: los horarios de la cancha más cercana tienen que quedar arriba del pliegue.
 */
const meta = {
  title: 'Public/Landing/Pagina',
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
    viewport: {
      options: {
        celular320: { name: 'celular 320', styles: { width: '320px', height: '640px' } },
        celular375: { name: 'celular 375', styles: { width: '375px', height: '812px' } },
        celular390: { name: 'celular 390', styles: { width: '390px', height: '844px' } },
      },
    },
    fetchMock: [
      { match: '/api/public/search', json: { results: complejos, total: 3 } },
      { match: '/api/public/availability', json: dia },
    ],
  },
  globals: { viewport: { value: 'celular390', isRotated: false } },
  decorators: [withGeolocation('found')],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const PLAYER = {
  playerId: 'p1',
  firstName: 'Tomás',
  lastName: 'Ibáñez',
  avatarUrl: null,
  email: 'tomas.ibanez@example.com',
}

function Pagina({ conSesion }: { conSesion: boolean }) {
  return (
    <PortalWorld>
      <PortalShell
        signOutAction={fn(async () => {})}
        initialSession={{
          session: conSesion ? PLAYER : null,
          favoriteTenantIds: new Set(),
          staffPanelPath: null,
        }}
      >
        <Hero cities={cityCounts()} />
        <OwnersStrip />
      </PortalShell>
    </PortalWorld>
  )
}

/** Pliegue de un celular de 844 px de alto: el primer horario de "Libre hoy" ya se ve y se toca. */
const horariosArribaDelPliegue: Story['play'] = async ({ canvasElement }) => {
  await expect(window.innerWidth).toBe(390)
  const canvas = within(canvasElement)
  const primero = await canvas.findByRole('link', { name: 'Reservar hoy a las 18:00' })
  await expect(primero.getBoundingClientRect().bottom).toBeLessThanOrEqual(844)
  await expect(canvasElement.querySelectorAll('main')).toHaveLength(1)
}

export const SinSesion: Story = {
  render: () => <Pagina conSesion={false} />,
  play: horariosArribaDelPliegue,
}

export const ConSesionDeJugador: Story = {
  render: () => <Pagina conSesion />,
  // Con sesión la barra inferior tapa el pliegue de abajo: el horario tiene que quedar arriba
  // de ELLA, no del borde de la pantalla.
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(390)
    const canvas = within(canvasElement)
    const primero = await canvas.findByRole('link', { name: 'Reservar hoy a las 18:00' })
    const barra = canvas.getByRole('navigation', { name: 'Navegación del jugador' })
    await expect(primero.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      barra.getBoundingClientRect().top,
    )
  },
}

const mismoRenglon = (els: Element[]) =>
  new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size === 1

/** A 320 px los cuatro horarios entran en una fila (sin "21:00" solo abajo) y miden 44 px o más. */
export const CuatroHorariosA320: Story = {
  globals: { viewport: { value: 'celular320', isRotated: false } },
  render: () => <Pagina conSesion={false} />,
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(320)
    const grupo = await within(canvasElement).findByRole('group', {
      name: 'Turnos libres hoy en Complejo San Martín',
    })
    const horarios = within(grupo).getAllByRole('link')
    await expect(horarios).toHaveLength(4)
    await expect(mismoRenglon(horarios)).toBe(true)
    for (const h of horarios)
      await expect(h.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  },
}

/** Esperando la ubicación: la silueta de la tarjeta calza con la real, y sus 4 esqueletos van en una fila a 375 px. */
export const BuscandoA375: Story = {
  globals: { viewport: { value: 'celular375', isRotated: false } },
  decorators: [withGeolocation('pending')],
  render: () => <Pagina conSesion={false} />,
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(375)
    const esqueletos = [...canvasElement.querySelectorAll('.skeleton')].filter(
      (e) => Math.round(e.getBoundingClientRect().height) === 44,
    )
    await expect(esqueletos).toHaveLength(4)
    await expect(mismoRenglon(esqueletos)).toBe(true)
  },
}
