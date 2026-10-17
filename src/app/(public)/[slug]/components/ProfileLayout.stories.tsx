import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import { openingHours } from '@/test/fixtures/tenant'
import {
  availabilityResponseCourts,
  publicCourtCard,
  publicTenant,
  reviews,
} from '@/test/fixtures/public'
import ComplexHero from './ComplexHero'
import ProfileLayout from './ProfileLayout'
import ProfileRest from './ProfileRest'
import ReserveSection from './ReserveSection'

// Lo que manda el servidor: con los precios visibles trae el monto; si el complejo los oculta, `null`.
const availabilityMock = (options: { price?: number | null } = {}) => [
  {
    match: '/api/public/availability',
    json: availabilityResponseCourts(5, { formats: [5, 7], ...options }),
  },
]
const SHOWING_PRICES = availabilityMock()
const HIDING_PRICES = availabilityMock({ price: null })

/**
 * La ficha entera como la arma `(perfil)/page.tsx` (la page es un Server Component async con la
 * base: no se puede renderizar acá), con `PortalWorld` montado y el MISMO `ProfileRest` que
 * publica la página. Sirve para mirar la composición: hero → reserva → resto, y desde 1024 px la
 * reserva como columna lateral fija.
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
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          {/* La barra de 56 px del portal no está en las stories: este hueco deja la ficha donde cae
              en la página real (el sticky de la reserva, `top-14`, depende de eso). */}
          <div className="h-14" aria-hidden />
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof ProfileLayout>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Tres canchas con foto (solo las `bg-*` locales de las fixtures: nada de capturas de producto); la
 * foto que sobra de la primera es la de la galería. Con los precios visibles cada cancha dice su
 * "Desde" (`fromPriceCents`); si el complejo los oculta el servidor lo manda en `null`.
 */
const COURTS = [
  publicCourtCard({
    id: 'court-0',
    name: 'Cancha 1',
    photos: ['/bg-hero-desktop.png', '/bg-how-it-works.png'],
  }),
  publicCourtCard({ id: 'court-1', name: 'Cancha 2', format: 7, photos: ['/bg-hero-2.png'] }),
  publicCourtCard({ id: 'court-2', name: 'Cancha 3', photos: ['/bg-owner.png'] }),
]
const WITHOUT_PRICES = COURTS.map((court) => ({ ...court, fromPriceCents: null }))
const trackViewed = fn(async () => {})

function Page({
  complete,
  hidePrices = !complete,
  name,
}: {
  complete: boolean
  hidePrices?: boolean
  name?: string
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
          reviews={{ initial: complete ? reviews() : [], total: complete ? 3 : 0, average: 4.6 }}
        />
      }
    />
  )
}

/** Con portada, canchas con foto, fotos, horarios, servicios y reseñas; los precios, a la vista. */
export const Completa: Story = {
  args: { hero: null, reserve: null },
  render: () => <Page complete hidePrices={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('radio', { name: /^21:00/ }))
    await expect(await canvas.findByText('Canchas libres a las 21:00')).toBeVisible()
    // Todos los títulos de sección miden lo mismo (incluido "Canchas libres a las 21:00").
    const sizes = canvas
      .getAllByRole('heading', { level: 2 })
      .map((h) => getComputedStyle(h).fontSize)
    await expect(new Set(sizes).size).toBe(1)
    // Los horarios resaltan el día de hoy (sábado con el reloj congelado).
    await expect(canvas.getByText('hoy')).toBeVisible()
    // Las fotos de las fichas de cancha no se repiten en la galería: queda la que sobra.
    await expect(canvas.getByRole('region', { name: 'Fotos del complejo' })).toHaveTextContent(
      '(1)',
    )
    // Precios coherentes: las canchas dicen su "Desde" y la lista de canchas libres, el monto.
    await expect(canvas.getAllByText(/^Desde/)).toHaveLength(3)
    await expect(canvas.getAllByText(/15\.000/).length).toBeGreaterThan(3)
  },
}

/** El mismo complejo pero sin mostrar precios: ningún `$` en pantalla (canchas ni lista de libres). */
export const PreciosOcultos: Story = {
  args: { hero: null, reserve: null },
  parameters: { fetchMock: HIDING_PRICES },
  render: () => <Page complete hidePrices />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('radio', { name: /^21:00/ }))
    await expect(await canvas.findByText('Canchas libres a las 21:00')).toBeVisible()
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
    await expect(await canvas.findByRole('radiogroup', { name: 'Hora' })).toBeVisible()
    await expect(canvas.queryByRole('region', { name: 'Reseñas' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('img', { name: /Portada/ })).not.toBeInTheDocument()
  },
}
