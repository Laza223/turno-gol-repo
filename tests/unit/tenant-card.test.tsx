// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { publicTenantCard } from '@/test/fixtures/tenant'

// next/image necesita config de runtime: lo simplificamos a un <img> marcado.
vi.mock('next/image', () => ({
  default: ({ fill: _fill, ...props }: { fill?: boolean } & Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img data-next-image {...(props as Record<string, never>)} />
  },
}))
// El botón de favorito usa hooks de toast/fetch que no aportan a estos tests.
vi.mock('@/components/public/FavoriteButton', () => ({ default: () => null }))

import TenantCard from '@/app/(public)/explorar/components/TenantCard'
import { buildReservarHref } from '@/lib/booking/reserve-url'

afterEach(() => cleanup())

const tenant = publicTenantCard({
  id: 't1',
  slug: 'el-potrero',
  name: 'El Potrero',
  coverUrl: null,
  allowOnlineBooking: true,
  fromPriceCents: 3_600_000,
  courtFormats: [5, 7],
  distanceKm: 1.2,
})

const today = {
  date: '2026-06-15',
  pills: [
    { time: '19:00', courtId: 'c1', durationMins: 60 },
    { time: '20:00', courtId: 'c2', durationMins: 60 },
    { time: '22:00', courtId: 'c1', durationMins: 60 },
  ],
  more: 3,
}

describe('TenantCard (vidrio)', () => {
  it('el nombre lleva a la ficha y la foto pasa por next/image con su alt', () => {
    const { container } = render(<TenantCard tenant={tenant} photo="https://x/foto.webp" />)
    expect(screen.getByRole('link', { name: 'El Potrero' }).getAttribute('href')).toBe(
      '/el-potrero',
    )
    const img = container.querySelector('img')
    expect(img?.hasAttribute('data-next-image')).toBe(true)
    expect(img?.getAttribute('alt')).toBe('Cancha de El Potrero')
  })

  it('sin foto muestra las iniciales', () => {
    render(<TenantCard tenant={tenant} />)
    expect(screen.getByText('EL')).toBeTruthy()
  })

  it('la línea de distancia y tamaños, y el precio "desde" por turno', () => {
    render(<TenantCard tenant={tenant} />)
    expect(screen.getByText('a 1,2 km · Fútbol 5 y 7')).toBeTruthy()
    expect(screen.getByText(/desde/).textContent).toMatch(/desde \$\s?36\.000/)
  })

  it('con precios ocultos dice "Precio en su página" y no muestra ningún $', () => {
    const { container } = render(
      <TenantCard tenant={{ ...tenant, fromPriceCents: null, fromPricePerPlayerCents: null }} />,
    )
    expect(screen.getByText('Precio en su página')).toBeTruthy()
    expect(container.textContent).not.toMatch(/\$/)
  })

  it('los horarios de hoy reservan esa hora en esa cancha y "+3" lleva a la ficha', () => {
    render(<TenantCard tenant={tenant} today={today} />)
    expect(screen.getByRole('list', { name: 'Horarios libres de hoy' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Reservar a las 20:00' }).getAttribute('href')).toBe(
      buildReservarHref('el-potrero', { courtId: 'c2', date: '2026-06-15', time: '20:00' }),
    )
    const more = screen.getByRole('link', { name: 'Ver 3 horarios más de hoy' })
    expect(more.textContent).toBe('+3')
    expect(more.getAttribute('href')).toBe('/el-potrero')
  })

  it('si la lectura de horarios falló, no dice nada de hoy (no miente "sin horarios")', () => {
    render(<TenantCard tenant={tenant} />)
    expect(screen.queryByText('Hoy')).toBeNull()
    expect(screen.queryByText(/Hoy no le quedan horarios/)).toBeNull()
  })

  it('sin horarios hoy lo dice y manda a la ficha', () => {
    render(<TenantCard tenant={tenant} today={null} />)
    expect(
      screen.getByText('Hoy no le quedan horarios. Mirá otros días en su página.'),
    ).toBeTruthy()
  })

  it('sin reserva online no muestra horarios aunque lleguen', () => {
    render(<TenantCard tenant={{ ...tenant, allowOnlineBooking: false }} today={today} />)
    expect(screen.queryByRole('link', { name: /Reservar a las/ })).toBeNull()
    expect(
      screen.getByText('No toma reservas online. En su página ves cómo reservar.'),
    ).toBeTruthy()
  })

  it('sin distancia la línea muestra solo los tamaños', () => {
    render(<TenantCard tenant={{ ...tenant, distanceKm: null }} />)
    expect(screen.getByText('Fútbol 5 y 7')).toBeTruthy()
  })
})
