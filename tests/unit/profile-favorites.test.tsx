// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'

// Mismos mocks que tenant-card.test: next/image sin runtime y FavoriteButton
// sin hooks de toast/fetch.
vi.mock('next/image', () => ({
  default: ({ fill: _fill, ...props }: { fill?: boolean } & Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img data-next-image {...(props as Record<string, never>)} />
  },
}))
vi.mock('@/components/public/FavoriteButton', () => ({ default: () => null }))

import FavoritesList from '@/app/(player)/perfil/FavoritesList'

afterEach(() => cleanup())

function tenant(id: string, name: string): PublicTenantCard {
  return {
    id,
    slug: name.toLowerCase().replace(/\s/g, '-'),
    name,
    address: 'Av. Siempreviva 742',
    city: 'Rosario',
    province: 'Santa Fe',
    logoUrl: null,
    coverUrl: null,
    allowOnlineBooking: true,
    fromPriceCents: null,
    amenities: {},
    avgRating: 0,
    reviewCount: 0,
    distanceKm: null,
    latitude: null,
    longitude: null,
    courtSurfaces: [],
    courtFormats: [],
  }
}

describe('FavoritesList (perfil del jugador)', () => {
  it('con 3 favoritos renderiza 3 TenantCards', () => {
    render(
      <FavoritesList
        tenants={[tenant('t1', 'El Potrero'), tenant('t2', 'La Bombonerita'), tenant('t3', 'Goleada FC')]}
        photosByTenant={{}}
      />,
    )
    // TenantCard renderiza <article>; una por favorito, en el orden recibido.
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'El Potrero' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'La Bombonerita' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Goleada FC' })).toBeTruthy()
  })

  it('cada card linkea al perfil público del complejo', () => {
    render(<FavoritesList tenants={[tenant('t1', 'El Potrero')]} photosByTenant={{}} />)
    expect(screen.getByRole('link', { name: 'El Potrero' }).getAttribute('href')).toBe(
      '/el-potrero',
    )
  })

  it('sin favoritos muestra empty state con CTA a explorar', () => {
    render(<FavoritesList tenants={[]} photosByTenant={{}} />)
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getByText(/no marcaste complejos favoritos/i)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Explorar complejos' }).getAttribute('href'),
    ).toBe('/explorar')
  })
})
