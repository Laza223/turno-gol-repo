import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { openingHours } from '@/test/fixtures/tenant'
import {
  availabilityResponseCourts,
  publicCourtCard,
  publicTenant,
  reviews,
  todayArt,
  weeklyAvailabilityResponse,
} from '@/test/fixtures/public'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import ComplexHero from './ComplexHero'
import ProfileLayout from './ProfileLayout'
import ProfileRest from './ProfileRest'
import ReserveSection from './ReserveSection'

// Lo que manda el servidor: con los precios visibles trae el monto; si el complejo los oculta, `null`.
const availabilityMock = (options: { price?: number | null } = {}) => [
  // La semana del paso 1 va primero: la ruta del día es prefijo de esta.
  { match: '/api/public/availability/week', json: weeklyAvailabilityResponse(todayArt()) },
  {
    match: '/api/public/availability',
    json: availabilityResponseCourts(5, { formats: [5, 7], ...options }),
  },
]
const SHOWING_PRICES = availabilityMock()
const HIDING_PRICES = availabilityMock({ price: null })

/**
 * La ficha entera como la arma `(perfil)/page.tsx` (la page es un Server Component async con la
 * base: no se puede renderizar acá), con la marca del portal de vidrio y el MISMO `ProfileRest`
 * que publica la página. Sirve para mirar la composición: hero → reserva → resto, y desde 1024 px
 * la reserva como columna lateral fija.
 */
const meta = {
  title: 'Player/TenantProfile/Page',
  component: ProfileLayout,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/complejo-fenix' } },
    fetchMock: SHOWING_PRICES,
  },
  decorators: [
    (Story) => (
      <div data-portal-glass className="min-h-dvh text-portal-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileLayout>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Tres canchas, una sin foto (solo las `bg-*` locales de las fixtures: nada de capturas de
 * producto): todas salen como tile y la galería junta las fotos de todas. Con los precios visibles
 * cada cancha dice su "Desde" (`fromPriceCents`); si el complejo los oculta el servidor lo manda
 * en `null`.
 */
const COURTS = [
  publicCourtCard({
    id: 'court-0',
    name: 'Cancha 1',
    photos: ['/bg-hero-desktop.png', '/bg-how-it-works.png'],
  }),
  publicCourtCard({ id: 'court-1', name: 'Cancha 2', format: 7, photos: ['/bg-hero-2.png'] }),
  publicCourtCard({ id: 'court-2', name: 'Cancha 3', photos: ['/bg-owner.png'] }),
  publicCourtCard({ id: 'court-3', name: 'Cancha 4', photos: [] }),
]
const WITHOUT_PRICES = COURTS.map((court) => ({ ...court, fromPriceCents: null }))
const trackViewed = fn(async () => {})

// Dos partidos del tablón en este complejo (un "Falta 1" y un "Busca rival").
const MATCHES: RivalBoardItem[] = [
  {
    id: 'match-1',
    tenantId: 'tenant-1',
    tenantName: 'Complejo Fénix',
    tenantSlug: 'complejo-fenix',
    startsAt: new Date('2026-03-15T00:00:00Z'),
    format: 5,
    capacity: 10,
    level: 'parejo',
    seeking: 'players',
    seekingPosition: 'any',
    confirmedCount: 9,
    hasStamp: true,
  },
  {
    id: 'match-2',
    tenantId: 'tenant-1',
    tenantName: 'Complejo Fénix',
    tenantSlug: 'complejo-fenix',
    startsAt: new Date('2026-03-21T23:00:00Z'),
    format: 7,
    capacity: 7,
    level: 'tranqui',
    seeking: 'rival',
    seekingPosition: null,
    confirmedCount: 7,
    hasStamp: false,
  },
]

function Page({
  complete,
  hidePrices = !complete,
  name,
  withMatches = false,
}: {
  complete: boolean
  hidePrices?: boolean
  name?: string
  withMatches?: boolean
}) {
  const tenant = publicTenant(
    complete
      ? { coverUrl: '/bg-hero-desktop.png', hidePrices, ...(name ? { name } : {}) }
      : {
          name: name ?? 'El Vagón Deportivo',
          slug: 'el-vagon-deportivo',
          description: null,
          amenities: {},
          hidePrices,
          closesNextDay: true,
          openingHours: openingHours({
            mon: { open: '09:00', close: '01:00' },
            tue: { open: '09:00', close: '01:00' },
            wed: { open: '09:00', close: '01:00' },
            thu: { open: '09:00', close: '01:00' },
            fri: { open: '09:00', close: '01:00' },
            sat: { open: '09:00', close: '01:00' },
            sun: { open: '09:00', close: '01:00' },
          }),
        },
  )
  return (
    <ProfileLayout
      hero={
        <ComplexHero
          tenant={tenant}
          courtCount={5}
          formats={[5, 7]}
          avgRating={complete ? 4.6 : 0}
          reviewCount={complete ? 3 : 0}
        />
      }
      reserve={<ReserveSection tenant={tenant} formats={[5, 7]} trackViewed={trackViewed} />}
      rest={
        <ProfileRest
          tenant={tenant}
          courts={complete ? (hidePrices ? WITHOUT_PRICES : COURTS) : []}
          tournaments={[]}
          openMatches={withMatches ? MATCHES : []}
          reviews={{ initial: complete ? reviews() : [], total: complete ? 3 : 0, average: 4.6 }}
        />
      }
    />
  )
}

/** Con portada, canchas (una sin foto), fotos, horarios, servicios y reseñas; los precios, a la vista. */
export const Completa: Story = {
  args: { hero: null, reserve: null },
  render: () => <Page complete hidePrices={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Todas las canchas salen como tile, con o sin foto.
    await expect(canvas.getByRole('region', { name: 'Canchas' })).toHaveTextContent('(4)')
    // Los títulos de los bloques del resto miden lo mismo.
    const sizes = ['Canchas', 'Fotos del complejo', 'Reseñas'].map(
      (name) =>
        getComputedStyle(
          within(canvas.getByRole('region', { name })).getByRole('heading', { level: 2 }),
        ).fontSize,
    )
    await expect(new Set(sizes).size).toBe(1)
    // Los horarios resaltan el día de hoy (sábado con el reloj congelado).
    await expect(canvas.getByText('hoy')).toBeVisible()
    // La galería junta las fotos de todas las canchas, sin repetir.
    await expect(canvas.getByRole('region', { name: 'Fotos del complejo' })).toHaveTextContent(
      '(4)',
    )
    // Precios a la vista: cada cancha dice su "Desde".
    await expect(canvas.getAllByText(/^Desde/)).toHaveLength(4)
  },
}

/** El mismo complejo pero sin mostrar precios: ningún `$` en las canchas. */
export const PreciosOcultos: Story = {
  args: { hero: null, reserve: null },
  parameters: { fetchMock: HIDING_PRICES },
  render: () => <Page complete hidePrices />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('region', { name: 'Canchas' })).toBeVisible()
    await expect(canvasElement.textContent).not.toContain('$')
    await expect(canvas.queryByText(/^Desde/)).not.toBeInTheDocument()
  },
}

/** Un nombre de ~50 letras (tres líneas a 28 px): pasa a 24 px y entra en dos; la reserva no se va del primer pantallazo. */
export const NombreLargo: Story = {
  args: { hero: null, reserve: null },
  render: () => (
    <Page complete hidePrices={false} name="Club Deportivo y Social Los Hermanos de Palermo" />
  ),
  play: async ({ canvasElement }) => {
    const title = await within(canvasElement).findByRole('heading', { level: 1 })
    await expect(getComputedStyle(title).fontSize).toBe('24px')
    await expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(64)
  },
}

/** El caso mínimo (tipo El Vagón): sin portada, fotos, reseñas ni servicios; cada bloque desaparece. */
export const Minima: Story = {
  args: { hero: null, reserve: null },
  parameters: { fetchMock: HIDING_PRICES },
  render: () => <Page complete={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('heading', { level: 1 })).toBeVisible()
    await expect(canvas.queryByRole('region', { name: 'Reseñas' })).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('.fr-bg')).toBeNull()
  },
}

/** Con el flag `rival` y partidos en el complejo: "Partidos abiertos" es la primera sección del resto. */
export const ConPartidosAbiertos: Story = {
  args: { hero: null, reserve: null },
  render: () => <Page complete hidePrices={false} withMatches />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const section = canvas.getByRole('region', { name: 'Partidos abiertos' })
    await expect(within(section).getAllByRole('link', { name: /Pedir/ })).toHaveLength(2)
    await expect(within(section).getByRole('link', { name: 'Ver el tablón' })).toBeVisible()
  },
}
